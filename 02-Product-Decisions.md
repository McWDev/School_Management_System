# Product Decisions and Assumptions

This document records default choices so development can proceed without repeatedly asking about low-impact decisions. Important policy choices remain flagged for confirmation.

## Confirmed defaults for MVP
1. **Multi-tenant SaaS:** multiple schools use one deployment, with strict tenant data separation.
2. **Branches:** each school may have one or more branches; users can be global to a school or limited to a branch.
3. **Stack:** Next.js App Router + TypeScript, Node.js runtime, Neon PostgreSQL, Drizzle ORM.
4. **Authentication:** custom email/username + password login and server-managed sessions; no third-party auth provider.
5. **UI:** professional, modern admin dashboard; collapsible sidebar, top navigation, cards, tables, charts, search and filters.
6. **Initial language:** English, with localization-ready labels.
7. **Responsive:** desktop-first admin experience that remains usable on phones.
8. **Soft delete/archive:** academic and financial records with history are archived or reversed rather than hard-deleted.
9. **Reports:** print and CSV export in MVP.
10. **Payments:** manual recording only; no payment gateway.
11. **Online exams:** not included; exam module manages exam setup, marks and results.
12. **Testing:** run lint, typecheck, unit/integration tests and relevant Playwright tests at each task.
13. **Database changes:** migrations committed to source control.
14. **No secrets in source control:** `.env.local` is ignored and `.env.example` contains placeholders only.

## Decisions requiring school-owner confirmation before the relevant module is finalized
- Country-specific student ID format.
- School currency and receipt numbering format.
- Exact grading scale (letter grades/pass marks) and whether grades vary by class or academic year.
- Whether excused attendance counts toward the attendance percentage.
- Whether students may be enrolled in more than one class in the same academic year.
- Whether fees are assigned automatically at enrollment or manually by finance staff.
- Whether student/teacher/guardian portal is needed in a later phase.
- Data retention and legal/privacy obligations for the deployment country.

## Rules for Claude Code
- Apply confirmed defaults automatically.
- Do not silently invent school policy for the unresolved items above.
- For unresolved items, implement configurable structures or use clearly marked defaults only when necessary, and document the assumption.
- Ask the user only when the decision materially changes data model, security, financial correctness or core workflow.

## Approved decisions log
- **2026-10-17 — Uploads (Open Question 12):** Profile photos (students, teachers) and school logos are included in the MVP. Storage provider, size and type limits will be chosen and documented in the task that first implements uploads. Files with personal data (photos) must use private storage with access checked on the server.
- **2026-10-17 — Neon branches:** Development and tests use the persistent Neon `development` branch; `production` is kept clean for real data. Other branches auto-expire after 7 days (`neon.ts`).
- **2026-10-17 — Branch scope for students and teachers:** `students` get a direct `branch_id` (home branch) and teachers get a `teacher_branch_access` link table, so branch isolation also applies to students without an active enrollment and to teachers (applies in Tasks 09–10). This extends `06-Data-Model.md`.
- **2026-10-17 — Login identifier:** User email is unique across the whole platform (case-insensitive), so login needs only email + password (applies in Task 05).
- **2026-10-17 — Hosting and driver:** Target a Node.js host (Vercel recommended); the app uses node-postgres (`pg`) over Neon's pooled connection, migrations use the direct connection (final hosting confirmed in Task 18).
- **2026-10-17 — Rate limiting storage:** Login/reset rate-limit counters are stored in Postgres, not in memory, so limits hold across serverless instances (applies in Task 05).
- **2026-10-17 — Upload storage:** Neon object storage (branch buckets) is the first candidate for photos/logos, confirmed when uploads are implemented.
- **2026-10-17 — School registration workflow:** New schools start as `pending` and must be approved by a Platform Super Admin before use (Open Question 11 default). Transitions: pending→active (approve), pending→archived (reject), active→suspended (suspend), suspended→active (reactivate), suspended→archived (archive). Suspension, rejection and archiving require a reason.
- **2026-10-17 — Codes:** School and branch codes are stored upper-case (A–Z, 0–9, hyphen) and are unique case-insensitively: school codes platform-wide, branch codes per school.
- **2026-10-17 — School Profile and School Registrations combined:** Settings shows a single **School Profile** item (`/settings/school-profile`); there is no separate School Registrations item. School users see their own school's registration details (code, status, status history) together with the editable profile. Platform users (no school) see the school registrations list there, with register/approve/reject/suspend/reactivate/archive actions. `/settings/school-registrations` redirects to it. This updates the navigation in `04-UI-UX-Design-System.md`.
- **2026-10-17 — Navigation shows every tab:** All sidebar tabs are listed for every signed-in user. Tabs the user's role does not allow are shown disabled (greyed, lock icon, not clickable) rather than hidden (`04-UI-UX-Design-System.md` allows "hidden or disabled"). Pages still refuse access on the server.
- **2026-10-17 — Main admin and navigation (supersedes the two entries above about School Profile and showing every tab):** The **School Admin** is the main administrator: every school tab is visible and opens. Other users see only the tabs their roles allow (others are hidden). The **Platform Super Admin** only manages schools on a separate **School Registrations** page (platform users only; school users never see it). `/settings/school-registrations` is a real page again.
- **2026-10-17 — School Profile is the school's letterhead:** School Profile holds the details printed on report sheets and letters: school name, logo, manager name, phone, address, motto, website and official email (plus optional legal name). Currency and time zone move to General Settings (Task 07). Logos are PNG/JPEG/WebP up to 1 MB, stored privately in the database (`school_logos`) and served only to signed-in members of that school. SVG is not accepted (it can carry scripts).
- **2026-10-17 — Sidebar reduced to Dashboard:** At the product owner's request, the sidebar shows only **Dashboard** until they decide which tabs to add back. Existing pages and their server-side access rules are kept in the code (reachable by URL) and are not deleted.
- **2026-10-17 — Step 1: School Staff tab:** New sidebar tab **School Staff** (`/staff`) after Dashboard, for the School Admin (`staff.read` / `staff.manage`; not in other presets). Staff are school-wide records (not login accounts): full name and work type required; optional photo, phone, email, gender, date of birth (age calculated), address, location (area/district/city), hire date; status Active/Left (never deleted). Work types start with Teacher, Administrator, Accountant, Secretary, Librarian, Security Guard, Cleaner, Driver, Cook and can be added, renamed and removed (not while in use). Photos follow the logo rules (PNG/JPEG/WebP ≤ 1 MB, private).
- **2026-10-17 — Staff status, login and rules (step 1 follow-ups):** Staff status is **Active / Inactive / Left**. A staff member can be given optional **login access** (a username and password set by the school, no email). Only Active staff can sign in; Inactive or Left disables the account and signs them out immediately. The login page accepts email or username, and staff with login see the Dashboard only for now. Required staff fields: full name, work type, phone, gender, date of birth, hire date and location. Staff must be at least **15 years old**, and the hire date cannot be in the future. Staff can be **deleted** (with confirmation): the record, photo and login account are removed, and the audit log records the deletion. This supersedes "staff are never deleted".
- **2026-10-17 — Step 2: Dashboard redesign:** Welcome banner (school logo, name, motto, greeting in the school's time zone, today's date, headline number of current staff); quick actions; tiles for Active / Inactive / Left staff (each opens the filtered staff list) and active branches; charts for staff by work type and by gender (validated colors, table view for screen readers); recently added staff. All figures are real database counts for the viewer's school. Staff with login see a welcome and their own details; the platform admin sees school counts. Old placeholder metrics (students, fees, exams…) were removed until those modules exist.
