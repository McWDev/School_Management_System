# Testing and Quality Plan

## 1. Quality gates for every task
Before declaring a task complete:
1. Run formatter/linter.
2. Run TypeScript typecheck.
3. Run relevant unit tests.
4. Run relevant integration tests for database/business rules.
5. Run relevant Playwright tests for user-facing flows.
6. Manually inspect responsive states and error/empty/loading states where relevant.
7. Summarize changed files, commands run, results, unresolved issues and next task.
8. Do not continue automatically to the next task without user review.

Use the package scripts that actually exist; create and document them early.

## 2. Unit tests
Test:
- Zod validation schemas
- Fee balance and payment adjustment calculations
- Grade/percentage calculations
- Attendance rate calculation
- Permission helper functions
- Timetable overlap detection
- Status transition rules

## 3. Integration tests
Test:
- Tenant-scoped CRUD
- Branch-scoped reads/writes
- Student duplicate detection
- Enrollment rules
- Payment creation and reversal transaction
- Exam marks range and publication
- Attendance duplicate prevention
- Audit event creation
- User disablement and session revocation

## 4. End-to-end tests
Minimum journeys:
- Login, logout and protected route redirect
- School onboarding (test environment)
- Create branch and academic year
- Create class and course
- Create student and assign to class
- Create teacher and assign to class/course
- Record payment and print receipt
- Take attendance
- Create exam, enter marks and publish results
- View report and verify export permission
- Verify a Branch Admin cannot access another branch
- Verify a tenant user cannot access another school's data

## 5. Test data
- Use synthetic fixtures only.
- Create at least two tenants and two branches in authorization tests.
- Include active, archived, overdue, partial-payment and published/draft states.
- Never copy real student personal data into tests.

## 6. Definition of Done
A task is done only when:
- Acceptance criteria for the task pass.
- No TypeScript errors.
- No unresolved lint errors.
- Relevant automated tests pass.
- Database migrations are committed and reproducible.
- UI handles loading, empty, validation, error and success states.
- Permissions are enforced server-side.
- Documentation is updated if behavior or setup changed.
- User has reviewed the result before the next task begins.
