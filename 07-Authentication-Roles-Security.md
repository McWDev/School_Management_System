# Authentication, Authorization and Security

## 1. Custom authentication requirements
The system will implement its own authentication. This means the project owns the security design and must not implement a simplistic password/session mechanism.

- Login with configured email or username and password.
- Store passwords only as secure hashes using Argon2id (preferred) or bcrypt with a suitable cost factor.
- Never store plaintext passwords or reversible password encryption.
- Use opaque, cryptographically random session tokens.
- Store only a hash of the session token in the database.
- Put the raw session token in a `Secure`, `HttpOnly`, appropriately `SameSite` cookie.
- Use HTTPS in production.
- Rotate/revoke sessions on login, password reset, account disablement and suspicious events.
- Add login rate limiting and generic login errors to reduce account enumeration.
- Password reset tokens must be random, hashed at rest, single-use and time-limited.
- Do not implement custom cryptographic algorithms.

## 2. Authorization
Every server action, route handler and data query must check:
1. Is the user authenticated?
2. Is the user active?
3. Does the user have the required permission?
4. Does the user belong to the tenant that owns this record?
5. Is the record within the user's permitted branch scope?
6. Is the operation allowed for the current record status?

Never rely only on client-side navigation or hidden buttons.

## 3. Suggested permission keys
- `dashboard.read`
- `schools.read`, `schools.create`, `schools.update`, `schools.activate`, `schools.suspend`
- `branches.read`, `branches.create`, `branches.update`, `branches.archive`
- `academic_years.read`, `academic_years.manage`
- `students.read`, `students.create`, `students.update`, `students.archive`
- `teachers.read`, `teachers.create`, `teachers.update`, `teachers.archive`
- `classes.read`, `classes.manage`
- `courses.read`, `courses.manage`
- `fees.read`, `fees.manage_structure`, `fees.record_payment`, `fees.reverse_payment`
- `exams.read`, `exams.manage`, `exams.enter_marks`, `exams.publish_results`, `exams.correct_results`
- `attendance.read`, `attendance.take`, `attendance.correct`
- `timetable.read`, `timetable.manage`
- `reports.read`, `reports.export`
- `users.manage`, `roles.manage`
- `audit_logs.read`, `settings.manage`

## 4. Default role presets
- Platform Super Admin: platform tenant management and support; should not casually browse school personal data.
- School Admin: broad permissions within their school; branch scope can cover all branches.
- Branch Admin: broad operational permissions within assigned branch only.
- Teacher: assigned classes/courses, attendance and marks as permitted.
- Finance Officer: fees, payments, receipts and finance reports; no unnecessary academic data.
- Registrar: students, enrollments, classes and academic setup.
- Auditor: read-only access to approved reports and audit records.

## 5. Tenant isolation
- Resolve tenant from the authenticated server session and validated membership.
- Do not accept tenant scope solely from request body/query parameters.
- Every repository/query helper should require a tenant context.
- Add integration tests that create two tenants and prove cross-tenant reads/updates fail.
- Branch restrictions must be tested similarly.
- Platform Super Admin access should use explicit platform permissions and be audited.

## 6. Audit events
Record at minimum:
- Login success/failure summary (avoid recording secrets)
- User creation, role/permission changes, disablement
- Student/teacher archive and sensitive profile changes
- Payment record, reversal and adjustment
- Exam marks entry, publication and correction
- Attendance corrections
- Branch and academic year status changes
- School registration activation/suspension
- Sensitive report exports

## 7. Security baseline
- Validate all inputs server-side with Zod.
- Use parameterized queries through ORM.
- Avoid unsafe HTML rendering.
- Apply CSRF defenses for state-changing operations consistent with chosen Next.js patterns.
- Set secure headers and a suitable Content Security Policy where practical.
- Rate-limit login, reset-password and other abuse-prone endpoints.
- Restrict upload types and size if file uploads are introduced; store files in private object storage, not public application folders, when sensitive.
- Keep dependencies updated.
- Use least privilege for database and deployment credentials.
- Never expose stack traces or secrets to users.
- Add dependency/security checks to the release checklist.

## 8. Session defaults
Suggested initial policy: session expires after a configurable period of inactivity, with an absolute expiry. Document the final values and make them configurable where appropriate. Revoke sessions when a user is disabled or password reset is completed.
