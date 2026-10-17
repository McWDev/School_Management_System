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
