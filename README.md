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
