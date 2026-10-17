# MVP Acceptance Criteria

## Application and UX
- [ ] App runs locally using documented setup.
- [ ] Dashboard shell is responsive and usable on desktop/mobile.
- [ ] Sidebar navigation follows the approved module structure.
- [ ] Forms have labels, validation and useful errors.
- [ ] Tables support pagination and relevant search/filter options.
- [ ] Loading, empty, error and success states exist.

## Authentication and access control
- [ ] Custom login/logout works.
- [ ] Passwords are securely hashed.
- [ ] Sessions use secure cookies and stored token hashes.
- [ ] Protected pages and server actions reject unauthenticated users.
- [ ] Role/permission checks happen server-side.
- [ ] Disabled users cannot continue using revoked sessions.
- [ ] Login/reset endpoints have abuse protections.

## SaaS tenant and branch isolation
- [ ] Tenant A cannot read, edit, delete or export tenant B records.
- [ ] Branch-scoped user cannot access another branch's records.
- [ ] Every tenant-owned query is scoped on the server.
- [ ] School registration status transitions require platform permission.
- [ ] Cross-tenant and cross-branch integration tests pass.

## Academic operations
- [ ] Academic years validate dates and state.
- [ ] Classes are unique within their configured scope.
- [ ] Student numbers are unique within a school.
- [ ] Enrollment history is preserved.
- [ ] Teacher assignments are validated.
- [ ] Course/class relationships are maintained.
- [ ] Exam marks cannot exceed maximum marks or fall below zero.
- [ ] Published results require permission and corrections are audited.
- [ ] Attendance prevents duplicate session/student records.
- [ ] Timetable detects class and teacher overlaps.

## Finance
- [ ] Fee structures and student charges are recorded.
- [ ] Partial payments calculate balances correctly.
- [ ] Payment receipts are unique within the agreed scope.
- [ ] Posted payments cannot be hard-deleted.
- [ ] Reversals/adjustments require a reason and create audit entries.
- [ ] Finance views and reports require appropriate permissions.

## Reports and dashboard
- [ ] Reports are based on database records.
- [ ] Filters correctly affect results.
- [ ] Export permission is distinct from read permission.
- [ ] CSV exports respect tenant/branch scope.
- [ ] Dashboard has no fabricated metrics.
- [ ] Print layouts are readable.

## Release
- [ ] Lint and typecheck pass.
- [ ] Relevant unit/integration/E2E tests pass.
- [ ] Production build succeeds.
- [ ] No secrets are committed.
- [ ] Migrations are reviewed and reproducible.
- [ ] Backup/restore procedure is documented.
- [ ] No unresolved critical/high security issues.
