# Data Model — Initial Entity Blueprint

This is a logical blueprint, not a final SQL schema. Claude Code must convert it into Drizzle schema definitions and reviewed migrations.

## 1. Core multi-tenant entities

### tenants / schools
- id (UUID primary key)
- school_code (unique)
- name
- legal_name (optional)
- logo_url (optional)
- contact_email, phone, address (optional)
- currency_code
- timezone
- status: pending / active / suspended / archived
- created_at, updated_at

### branches
- id, tenant_id
- branch_code, name
- address/contact (optional)
- status
- created_at, updated_at
- Unique: (tenant_id, branch_code)

### users
- id, tenant_id nullable only for platform-level user
- email/username (unique policy to be finalized)
- password_hash
- full_name
- status
- last_login_at (optional)
- created_at, updated_at

### roles, permissions, user_roles, role_permissions
- tenant-scoped roles plus platform roles
- permission keys such as `students.read`, `students.create`, `fees.record_payment`, `reports.export`
- branch scope should be modeled explicitly, not inferred from role name alone

### user_branch_access
- user_id, branch_id
- Unique: (user_id, branch_id)

### sessions
- id
- user_id
- token_hash (never store raw session token)
- expires_at
- created_at
- revoked_at (optional)
- user_agent/ip metadata only if policy allows and safely stored

## 2. Academic entities
### academic_years
- id, tenant_id
- name, start_date, end_date
- status: planned / current / closed
- created_at, updated_at

### classes
- id, tenant_id, branch_id, academic_year_id
- class_code, name, capacity (optional), class_teacher_id (optional)
- status
- Unique: (tenant_id, branch_id, academic_year_id, class_code)

### students
- id, tenant_id
- student_number
- first_name, middle_name (optional), last_name
- date_of_birth (optional), gender (optional)
- phone/email/address (optional)
- guardian_name/contact (optional)
- admission_date
- photo_url (optional)
- status
- created_at, updated_at
- Unique: (tenant_id, student_number)

### student_enrollments
- id, tenant_id, student_id, class_id, academic_year_id, branch_id
- enrollment_date, status
- Keep enrollment history; enforce business rule against duplicate active enrollment.

### teachers
- id, tenant_id
- teacher_number
- first_name, last_name
- phone/email/address (optional)
- hire_date (optional), photo_url (optional), status
- Unique: (tenant_id, teacher_number)

### courses
- id, tenant_id
- course_code, name, description (optional), status
- Unique: (tenant_id, course_code)

### class_courses / teacher_assignments
- id, tenant_id, branch_id, academic_year_id, class_id, course_id, teacher_id
- Optional room/notes
- Use constraints to prevent duplicate assignments where applicable.

## 3. Fees and finance
### fee_structures
- id, tenant_id, branch_id nullable if school-wide, academic_year_id
- class_id nullable if applicable to all classes
- fee_type, amount, due_date (optional), status

### student_charges
- id, tenant_id, student_id, enrollment_id (optional), fee_structure_id (optional)
- description, amount, due_date, status
- created_by, created_at

### payments
- id, tenant_id, student_id, charge_id nullable for allocated/unallocated payment policy
- receipt_number, amount, payment_date, method
- reference (optional), notes (optional), recorded_by, status
- reversed_at/reversed_by/reversal_reason (or separate payment_reversals table)
- Unique receipt policy must be enforced per tenant/branch as decided.

Do not store card numbers or payment credentials. MVP supports manual payment records only.

## 4. Exams
### exams
- id, tenant_id, branch_id, academic_year_id, class_id
- name, exam_type, start_date (optional), end_date (optional), status: draft / scheduled / completed / published
- created_by, created_at, updated_at

### exam_subjects
- id, tenant_id, exam_id, course_id, max_marks, weight (optional)
- Unique: (exam_id, course_id)

### exam_results
- id, tenant_id, exam_id, exam_subject_id, student_id
- marks_obtained, grade (optional), status
- entered_by, reviewed_by (optional), published_at (optional)
- Unique: (exam_subject_id, student_id)

### grading_scales
- id, tenant_id, name, min_percentage, max_percentage, grade_label, remarks (optional)

## 5. Attendance
### attendance_sessions
- id, tenant_id, branch_id, class_id, academic_year_id
- attendance_date, subject_id nullable, taken_by, status
- Unique policy for class/date/subject must be confirmed.

### attendance_records
- id, tenant_id, session_id, student_id
- status: present / absent / late / excused
- note (optional), marked_by, updated_at
- Unique: (session_id, student_id)

## 6. Timetable
### timetable_entries
- id, tenant_id, branch_id, academic_year_id, class_id, course_id, teacher_id
- weekday, start_time, end_time, room (optional), status
- Add overlap validation in application logic; consider database constraints where practical.

## 7. Audit and support
### audit_logs
- id, tenant_id nullable for platform events
- actor_user_id nullable for system events
- action, entity_type, entity_id
- before_data / after_data JSONB with sensitive fields removed
- reason (optional), created_at
- request metadata minimized according to privacy policy

### notifications (optional MVP)
- id, tenant_id, user_id, type, title, body, read_at, created_at

## 8. Data-model rules
- Every tenant-owned table must include tenant_id directly or be safely scoped through a parent relation; direct tenant_id is preferred for critical queries.
- Use foreign keys and appropriate indexes.
- Unique constraints must include tenant scope.
- Use decimal/numeric types for monetary values, not floating-point.
- Use UTC timestamps where appropriate and display in the school's configured timezone.
- Avoid hard deletes for financial/academic history.
- Validate tenant and branch ownership on every relationship assignment.
- Never trust IDs from the browser without verifying their tenant/branch ownership.
