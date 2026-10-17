# Sequential Task Roadmap for Claude Code

## Working rule
**One task at a time.** Claude Code must not begin the next task until the current task has been implemented, tested, summarized and reviewed by the user. Do not combine tasks or scaffold the whole application in one response.

Each task must report:
- Goal and assumptions
- Files created/changed
- Commands executed
- Test results (actual, not guessed)
- Known limitations
- Manual verification steps
- Whether user approval is needed

---

## Task 00 — Documentation review (no coding)
**Goal:** Read the entire documentation package, identify contradictions and summarize the intended product.
**Acceptance:** No application code changed; unresolved high-impact questions listed.
**Claude Prompt:**
> Read the project documentation, starting with README.md and then all numbered documents. Do not write application code yet. Summarize the product scope, architecture, tenant/branch isolation rules, custom authentication requirements, module list, and task-by-task workflow. Identify contradictions or high-impact unanswered decisions. Wait for my approval.

## Task 01 — Repository and development environment
**Goal:** Inspect the existing repository (if any) and set up a minimal Next.js TypeScript project only if needed.
**Acceptance:** App starts locally; scripts for lint/typecheck/test are documented; no business modules.
**Claude Prompt:**
> Implement Task 01 only. Inspect the repository first. If no project exists, create a minimal Next.js App Router project with TypeScript, Tailwind CSS and the agreed linting setup. Add scripts for lint, typecheck and tests where appropriate. Do not build business modules, authentication or database schema yet. Run available checks and report exact output.

## Task 02 — UI foundation and dashboard shell
**Goal:** Create design tokens, sidebar, top bar, responsive shell, reusable buttons/cards/tables/forms and page layout.
**Acceptance:** Responsive placeholder dashboard; navigation structure follows the UI document; no fake business metrics presented as real.
**Claude Prompt:**
> Implement Task 02 only using 04-UI-UX-Design-System.md. Build a polished responsive admin shell and reusable UI primitives. Use realistic empty states/placeholders, not hardcoded production metrics. Add accessibility labels and mobile navigation. Run lint/typecheck/tests and show me how to verify the UI. Do not implement business logic or authentication yet.

## Task 03 — Neon connection, Drizzle and migration workflow
**Goal:** Connect Neon, add Drizzle schema setup and migration scripts, health-check wiring.
**Acceptance:** Safe local configuration; migration can be generated and applied to development; no secrets committed.
**Claude Prompt:**
> Implement Task 03 only. Configure Drizzle ORM and Neon PostgreSQL, create the database module, .env.example, migration scripts and a minimal health check. Do not add business tables beyond what is necessary for the connection check. Never invent or commit credentials. If DATABASE_URL is unavailable, create the setup instructions and stop before claiming a live connection works. Run all checks.

## Task 04 — Tenant, school registration and branches
**Goal:** Create tenant/branch schema, platform school-registration flow and tenant-context utilities.
**Acceptance:** A test can prove a user from tenant A cannot read or modify tenant B; branch scoping works.
**Claude Prompt:**
> Implement Task 04 only. Add reviewed Drizzle schemas and migrations for schools/tenants and branches, plus the minimum tenant-context and repository helpers. Implement school registration status workflow and server-side tenant/branch ownership checks. Add integration tests with at least two tenants and two branches. Do not implement all other modules. Explain migration commands and exact test output.

## Task 05 — Custom authentication and sessions
**Goal:** Secure login/logout, password hashing, sessions, protected layouts and password-reset foundation.
**Acceptance:** Unauthenticated access is blocked; session cookie is secure in production; session revocation works; no third-party auth provider.
**Claude Prompt:**
> Implement Task 05 only using 07-Authentication-Roles-Security.md. Build custom authentication with Argon2id or bcrypt, opaque random session tokens, only token hashes stored in DB, HttpOnly/Secure/SameSite cookies, login rate limiting, logout and session revocation. Add protected server layouts and tests. Do not store plaintext passwords or raw session tokens. If email delivery is not configured, document the reset flow limitation rather than pretending email works.

## Task 06 — Roles, permissions and audit logs
**Goal:** Permission catalog, role presets, user-role and branch access; audit helper.
**Acceptance:** Server actions and routes enforce permission and scope; permission changes audited.
**Claude Prompt:**
> Implement Task 06 only. Create permission/role schemas, role presets and reusable server-side authorization helpers. Add audit logging for user, role, branch and school-registration actions. Add tests for unauthorized and cross-branch requests. Hiding a button is not enough; enforce checks on the server. Run all checks.

## Task 07 — Academic years and school settings
**Goal:** Academic year CRUD, school profile, currency/timezone and grading-policy settings.
**Acceptance:** Validate date ranges; prevent invalid state transitions; maintain history.
**Claude Prompt:**
> Implement Task 07 only. Build Settings pages for Academic Years and School Profile/General Settings. Enforce tenant scope and permissions server-side. Validate start/end dates and current-year rules. Add loading, empty, error and success states and tests. Do not build Branches or School Registration again; reuse Task 04 foundations.

## Task 08 — Classes and courses
**Goal:** CRUD for classes/courses and relationships to branch, academic year and teachers where available.
**Acceptance:** Duplicate codes prevented; archived records remain in history; branch permissions enforced.
**Claude Prompt:**
> Implement Task 08 only. Build Classes and Courses/Subjects modules according to the PRD and data model. Include search, filters, pagination, validation, archive behavior and tests. Reuse the established UI and authorization helpers. Do not build Students or Teachers in this task.

## Task 09 — Students and enrollments
**Goal:** Student profiles, admission, class enrollment and historical enrollment records.
**Acceptance:** Unique student number; enrollment rules enforced; profile tabs show only implemented/available data safely.
**Claude Prompt:**
> Implement Task 09 only. Build student list, add/edit/detail pages, duplicate warnings and academic-year class enrollment. Use tenant/branch scoped server queries and retain historical records through archive/enrollment history. Do not show fake fee, attendance or exam history. Add unit/integration tests and report exact results.

## Task 10 — Teachers and assignments
**Goal:** Teacher profiles and assignment to classes/courses.
**Acceptance:** Teacher sees only assigned academic records unless granted broader permissions.
**Claude Prompt:**
> Implement Task 10 only. Build Teachers CRUD, archive, branch assignment and teacher/course/class assignments. Enforce access scope on the server. Add tests for assignment validation and teacher access restrictions. Do not implement attendance or exams yet.

## Task 11 — School fees and payments
**Goal:** Fee structures, student charges, partial payments, balance calculation, receipts and reversal.
**Acceptance:** Monetary amounts use decimal/numeric; payment history cannot be hard-deleted; corrections require reason and audit trail.
**Claude Prompt:**
> Implement Task 11 only. Build fee structures, student charges, payment recording, balances, printable receipts and reversal/adjustment workflow. Use database transactions and numeric/decimal amounts. Validate branch/tenant ownership and finance permissions. Add tests for partial payments, balance calculations, duplicate receipt numbers and reversal. Do not add an online payment gateway.

## Task 12 — Attendance
**Goal:** Attendance sessions, statuses and summaries.
**Acceptance:** No duplicate student/session records; teachers can mark attendance only for assigned classes; corrections audited.
**Claude Prompt:**
> Implement Task 12 only. Build attendance entry, class/date filters, Present/Absent/Late/Excused statuses and summary reports. Enforce teacher assignments, tenant and branch scopes server-side. Add duplicate prevention and tests for correction audit. Do not guess the final policy for excused absences; make the calculation configurable/documented.

## Task 13 — Exams and results
**Goal:** Exam setup, subject marks, grades and publishing.
**Acceptance:** Marks validated against max marks; draft/published permissions enforced; corrections audited.
**Claude Prompt:**
> Implement Task 13 only. Build exam setup, subject allocation, marks entry, result calculations, draft/review/publish flow and correction audit. Make grading rules configurable. Do not implement online exam-taking. Add tests for mark ranges, grade boundaries, publication access and correction history.

## Task 14 — Timetable
**Goal:** Weekly timetable and conflict detection.
**Acceptance:** Invalid time range and class/teacher overlaps blocked with understandable errors.
**Claude Prompt:**
> Implement Task 14 only. Build timetable CRUD and weekly view. Validate start/end times and detect overlapping schedules for the same class or teacher, considering branch and academic year. Add tests for edge cases and a mobile-friendly timetable display.

## Task 15 — Reports and exports
**Goal:** Reports across modules, filters, print layouts and CSV export.
**Acceptance:** Report results match records; tenant/branch access always enforced; export permission separate from read permission.
**Claude Prompt:**
> Implement Task 15 only. Build student, class, teacher, attendance, exam and fees reports using real database queries. Add date/branch/academic-year/class filters, print-friendly output and CSV export. Enforce reports.read and reports.export separately and audit sensitive exports. Add tests proving tenant/branch isolation in report queries.

## Task 16 — Dashboard real metrics and activity
**Goal:** Replace placeholders with permission-filtered database metrics and charts.
**Acceptance:** All metrics are computed from real data and correctly scoped; empty state when no data.
**Claude Prompt:**
> Implement Task 16 only. Connect dashboard cards, charts, upcoming items and recent activity to real database queries. Apply tenant and branch scope and permissions to every metric. Do not fabricate values. Add tests for calculations and scope. Verify mobile layout and loading/empty/error states.

## Task 17 — End-to-end testing and security review
**Goal:** Run complete workflows and authorization/security checks.
**Acceptance:** Core flows pass; cross-tenant and cross-branch tests pass; no critical/high findings left unresolved.
**Claude Prompt:**
> Implement Task 17 only. Add or complete Playwright journeys for login, setup, student admission, payment, attendance, exams/results, reports and timetable. Review custom auth, rate limiting, cookies, validation, audit logs, tenant isolation and branch isolation. Run all checks and report actual output. Fix issues found within this task; do not start deployment.

## Task 18 — Production readiness and deployment documentation
**Goal:** Prepare build/deployment steps, environment validation, migrations and backup/restore notes.
**Acceptance:** Production checklist complete; no secrets committed; build succeeds.
**Claude Prompt:**
> Implement Task 18 only. Prepare production configuration and deployment documentation for a Node.js-compatible host plus Neon. Validate environment variables, production build, migrations, secure cookies, health check, backup/restore notes and release checklist. Do not claim deployment succeeded unless you actually deploy and verify it. Do not start new features.

## Task 19 — Final acceptance and handover
**Goal:** Final review, admin setup guide, user guide and known-limitations list.
**Acceptance:** User can follow documented setup and core workflows; all known limitations listed.
**Claude Prompt:**
> Implement Task 19 only. Review the PRD and acceptance criteria against the completed application. Create concise admin and user guides, final module checklist, known limitations and handover notes. Run the full verification suite and report actual results. Do not add new features without approval.
