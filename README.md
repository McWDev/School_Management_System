# School Management System — Documentation Package

**Ujeeddo:** Dukumentiyada rasmiga ah ee qorshaynta iyo dhismaha School Management System (SMS), iyadoo la adeegsanayo Claude Code.

## Teknoolojiyada la doortay
- **Frontend & application:** Next.js (App Router) + TypeScript
- **Runtime/backend:** Node.js, iyadoo Next.js Route Handlers iyo Server Actions loo adeegsanayo backend-ka
- **Database:** Neon Serverless PostgreSQL
- **Database toolkit:** Drizzle ORM + Drizzle Kit
- **Validation:** Zod
- **Styling/UI:** Tailwind CSS + shadcn/ui, Lucide icons
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Testing:** Vitest, React Testing Library, Playwright
- **Authentication:** Authentication u gaar ah mashruuca (custom credentials, secure sessions, password hashing); lama adeegsanayo Clerk, Auth0 ama NextAuth/Auth.js.

## Sida loo isticmaalo
1. Akhri `01-PRD.md` oo xaqiiji baahida iyo xadka mashruuca.
2. Akhri `02-Product-Decisions.md` iyo `03-Architecture.md`.
3. Claude Code ha bilaabin coding ilaa dukumentiyada la akhriyo lana ansixiyo.
4. Hawsha u socodsii sida ku qoran `10-Task-Roadmap.md`: hal task mar, tijaabi, dib u eeg natiijada, ka dib u gudub task-ka xiga.
5. Task kasta waxaa la socda `Claude Prompt` lagu koobi karo Claude Code.
6. Dhammaan isbeddellada database-ka waa inay noqdaan migrations la version-gareeyay; ha ku tiirsanaan schema push toos ah production-ka.

## Dukumentiyada ku jira
- `01-PRD.md` — Product Requirements Document
- `02-Product-Decisions.md` — Go'aannada bilowga ah iyo assumptions
- `03-Architecture.md` — Qaab-dhismeedka application-ka
- `04-UI-UX-Design-System.md` — Dashboard iyo UI/UX
- `05-Modules-and-Workflows.md` — Qaybaha iyo workflows
- `06-Data-Model.md` — Database entities iyo xiriirrada
- `07-Authentication-Roles-Security.md` — Authentication, permissions, security
- `08-Testing-and-Quality.md` — Qorshaha testing/quality
- `09-Deployment-and-Operations.md` — Deployment iyo dayactir
- `10-Task-Roadmap.md` — Tasks sequential ah
- `11-Claude-Code-Working-Rules.md` — Xeerarka Claude Code
- `12-Acceptance-Criteria.md` — Shuruudaha aqbalidda
- `13-Open-Questions.md` — Go'aanno mustaqbalka la xaqiijinayo

## Xeerka muhiimka ah
**Ha dhisin dhammaan system-ka hal mar.** Dhis task keliya, socodsii checks/tests, sax khaladaadka, soo koob files-ka la beddelay iyo natiijada, kadib sug oggolaanshaha user-ka ka hor task-ka xiga.

## Development setup
**Requirements:** Node.js 20.9+ (developed on Node 24), npm.

```bash
npm install
npx playwright install chromium   # one-time, for E2E tests
npm run dev                       # http://localhost:3000
```

### Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run format` / `format:check` | Prettier write / check |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests (builds and starts the app) |
| `npm run check` | lint + typecheck + format check + unit tests |

### Tests layout
- `tests/unit` — Vitest unit tests
- `tests/integration` — Vitest integration tests (database/business rules)
- `tests/e2e` — Playwright journeys

## Database (Neon + Drizzle)
- **Neon project:** `Schools` (`autumn-bonus-18915899`). Branches: `production` (default, kept clean) and `development` (local work and tests). Neither expires; other branches created from `neon.ts` auto-expire after 7 days.
- **Driver:** `pg` (node-postgres) pool over the pooled `DATABASE_URL` (see `src/db/index.ts`). Migrations use the direct `DATABASE_URL_UNPOOLED`. SSL is upgraded to `sslmode=verify-full`.
- **Schema:** `src/db/schema/`. **Migrations:** `src/db/migrations/` (committed, reviewed). There is intentionally no `db:push`.

### First-time setup
```bash
npx neon@latest login                  # browser sign-in
npx neon@latest checkout development   # pins the branch, writes .env.local
npm run db:migrate                     # apply migrations to development
```

### Migration workflow
| Command | Purpose |
|---|---|
| `npm run db:generate` | Generate SQL from schema changes — **review the SQL before applying** |
| `npm run db:migrate` | Apply pending migrations to the branch in `.env.local` |
| `npm run db:check` | Check migration files are consistent |
| `npm run db:studio` | Browse the database (development only) |
| `npm run db:seed` | Load synthetic demo data (refuses to run on production; safe to re-run) |

Production migrations follow `09-Deployment-and-Operations.md` §4: review, test on a branch, back up, then apply.

### Health check
`GET /api/health` returns `200 {"status":"ok"}` or `503 {"status":"degraded"}`. It never exposes connection details.

## Tenant and branch isolation
All tenant-owned data access goes through repositories in `src/features/*/repository.ts`, which take a server-built context from `src/lib/tenant-context`:
- **`TenantContext`** (`tenantId` + branch scope `all` or a list of branch ids) — every query is filtered with `tenantFilter()` and, for branch-scoped users, `branchFilter()`. Records in another school or outside the branch scope behave as **not found**.
- **`PlatformContext`** — only for platform operations such as school registration and status changes.
- Contexts are built on the server (from the session, from Task 05). Never build one from IDs sent by the browser.
- Ids from the client are validated with `requireActiveBranch()` / `getBranch()` before being used in another record.
- Errors thrown from repositories (`src/lib/errors.ts`) carry user-safe messages; convert them with `toActionError()` in server actions.

`tests/integration/tenant-isolation.test.ts` proves this with two schools and two branches.

## Authentication (custom)
No third-party auth provider. Code: `src/lib/auth/` (service, session, password, tokens, rate limits) and `src/features/auth/` (server actions, forms).

- **Passwords:** Argon2id (19 MiB, t=2, p=1). Minimum 10 characters.
- **Sessions:** random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-sms_session`, `Secure`, in production). The database stores only an HMAC of the token (keyed by `SESSION_SECRET`). Sessions end after **8 h idle** or **7 days** (configurable). Every request re-checks the session, the user's status and the school's status, so disabling a user or suspending a school takes effect immediately.
- **Login:** one generic error for wrong email or password; unknown emails cost the same time. Specific messages (disabled account, pending/suspended school) appear only after a correct password. Login rotates the session.
- **Abuse protection (Postgres-backed):** 5 failed logins per account per 15 min; 50 attempts per IP per 15 min (`AUTH_LOGIN_IP_LIMIT`); 10 reset attempts per IP per 15 min.
- **CSRF:** state changes use Server Actions (POST-only, Origin checked by Next.js) plus `SameSite=Lax` cookies.
- **Route protection:** `src/proxy.ts` redirects visitors without a cookie to `/login` (optimistic). The `(dashboard)` layout validates the session on the server, and every data function must call `requireUser()` (Data Access Layer).
- **Password reset:** email delivery is **not configured**. An operator creates a single-use link (expires in 30 min), and using it revokes all of the user's sessions:
  ```bash
  npm run auth:reset-link -- user@example.com
  ```
  Share the link over a trusted channel. A user-management screen for this arrives with Task 06.

### Demo accounts (development only)
`npm run db:seed` creates these synthetic users with the password in `SEED_USER_PASSWORD` (`.env.local`):

| Email | Account |
|---|---|
| `platform.admin@sms.example` | Platform Super Admin |
| `admin@demo-hodan.example` | School Admin, Hodan Demo School (active) |
| `north.admin@demo-hodan.example` | Branch Admin, Hodan — North Campus only |
| `teacher@demo-hodan.example` | Teacher, Hodan — Main Campus only |
| `finance@demo-hodan.example` | Finance Officer, Hodan — all branches |
| `admin@demo-warta.example` | School Admin, Warta Demo Academy (pending, so login is refused) |

## Roles, permissions and audit log
- **Permission catalog:** `src/lib/permissions/catalog.ts` (keys from `07-Authentication-Roles-Security.md`, plus `platform_audit.read`). Migrations seed the `permissions` table from it, and a test keeps the two in sync.
- **Role presets:** `src/lib/permissions/presets.ts`. Every school gets School Admin (locked), Branch Admin, Teacher, Finance Officer, Registrar and Auditor when it is registered, and can add custom roles (school permissions only). The platform role, Platform Super Admin, has no access to school records.
- **Branch scope** is set per user: *all branches* or an explicit list (`user_branch_access`). Composite foreign keys stop it from pointing at another school's branch.
- **Enforcement:** `src/lib/authz` builds the `TenantContext` / `PlatformContext` (school, branch scope, permissions) from the session. Server actions use `tenantAction()` / `platformAction()`, and every repository function re-checks its permission and scope. Hiding navigation items is convenience only.
- **Guards:** admins cannot remove their own user-management access or disable themselves, and locked roles cannot be edited.
- **Audit log:** `src/lib/audit` writes `audit_logs` rows in the same transaction as the change (school registration and status, school profile, branches, users, roles, reset links) with secrets redacted. Server logs also scrub database query parameters.
- **New users** receive a one-time setup link (valid 24 h) instead of a password, because email delivery is not configured.
- **Navigation:** School Registrations is part of **School Profile** (`02-Product-Decisions.md`). Platform users see all registrations there; school users see their own registration and profile.
