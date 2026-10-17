# Modules and Core Workflows

## 1. School onboarding
1. Platform Super Admin creates or reviews school registration.
2. School registration is approved/activated.
3. School Admin signs in and completes school profile.
4. School Admin creates branches and academic year.
5. School Admin creates users and assigns roles/branch scope.
6. Academic Officer creates classes and courses.
7. Students and teachers are registered.
8. Fees, timetable, attendance and exams are configured as needed.

## 2. Student admission workflow
1. Authorized user opens Students → Add Student.
2. Form validates required fields and displays duplicate warnings.
3. Server revalidates input and checks tenant/branch permission.
4. Student record is saved with unique student number.
5. Enrollment/class assignment is recorded for the selected academic year.
6. Audit event is written.
7. Student profile displays current and historical records.

## 3. Teacher assignment workflow
1. Create teacher profile.
2. Assign branch access.
3. Assign teacher to class/course and academic year.
4. Teacher can access only assigned academic work unless granted broader permissions.
5. Changes to assignments are auditable.

## 4. Fees and payment workflow
1. Finance Officer configures fee structure or student charge.
2. Student account shows charges and current balance.
3. Finance Officer records full or partial payment.
4. Server validates amount, payment date, method and receipt number.
5. Payment and audit event are committed in a database transaction.
6. Receipt is available for print.
7. Corrections use reversal/adjustment with a mandatory reason; do not delete posted payments.

Balance formula:
`balance = total charges - total valid payments + applicable adjustments`
A balance must not silently become negative; overpayment behavior must be confirmed or explicitly represented as credit.

## 5. Exam and result workflow
1. Authorized academic user creates exam and selects academic year, branch, class and subjects.
2. Set maximum marks and grading policy.
3. Enter marks manually or through a validated bulk-entry screen.
4. Validate marks against each subject's maximum.
5. Save as draft.
6. Authorized role reviews and publishes results.
7. Published results are read-only for ordinary users; corrections require permission, reason and audit log.
8. Reports can be printed/exported by users with appropriate permissions.

## 6. Attendance workflow
1. Teacher opens an assigned class and date.
2. System loads the enrolled students.
3. Teacher marks Present, Absent, Late or Excused.
4. Save all records in one transaction.
5. Prevent duplicate session/student records.
6. Authorized correction records the old value, new value, actor and reason.

## 7. Timetable workflow
1. Select branch, academic year and class.
2. Add weekday, start/end times, course, teacher and optional room.
3. Check for overlapping time ranges for the class and teacher.
4. Show conflicts before saving.
5. Display weekly timetable and allow print.

## 8. Reporting workflow
1. User selects report type.
2. Select filters (date range, branch, academic year, class, status).
3. Server applies tenant and branch scopes.
4. Display paginated or summarized results.
5. Export/print only after checking the corresponding permission.
6. Export should record an audit event for sensitive reports.

## 9. Archiving and history
- Use archive/status changes for students, teachers, classes, courses and branches with history.
- Keep historical class enrollment, exam results, attendance and payments.
- Do not cascade-delete historical finance or academic records.
- Provide a clear status and explain why an archived record cannot be used for new operations.
