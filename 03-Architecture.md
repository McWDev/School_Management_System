# Application Architecture

## 1. High-level architecture
- Browser: responsive Next.js UI.
- Next.js App Router: pages, layouts, server components, server actions and route handlers.
- Node.js: runtime for server-side business logic.
- Neon: hosted PostgreSQL.
- Drizzle ORM: typed SQL queries and schema definitions.
- Zod: validate user-controlled input at server boundaries.
- Background jobs: not required for initial MVP; do not introduce a queue until a real use case exists.

## 2. Recommended project layout
```text
src/
  app/
    (auth)/
      login/page.tsx
      forgot-password/page.tsx
      reset-password/page.tsx
    (dashboard)/
      layout.tsx
      dashboard/page.tsx
      classes/
      students/
      teachers/
      courses/
      fees/
      exams/
      attendance/
      reports/
      timetable/
      settings/
        academic-years/
        branches/
        school-registration/
        users/
        roles/
    api/
      health/route.ts
  components/
    ui/
    layout/
    data-table/
    forms/
    charts/
  features/
    auth/
    tenants/
    branches/
    students/
    teachers/
    classes/
    courses/
    fees/
    exams/
    attendance/
    reports/
    timetable/
    settings/
  lib/
    auth/
    db/
    permissions/
    validation/
    audit/
    tenant-context/
    utils/
  db/
    schema/
    migrations/
    seed.ts
tests/
  unit/
  integration/
  e2e/
```

## 3. Architecture rules
- Keep domain/business logic out of UI components.
- Server-side actions and route handlers must authenticate and authorize every request.
- Resolve the current user, tenant and branch scope on the server; never trust a client-supplied tenant ID as proof of access.
- All tenant-owned queries must include tenant scope. Add helper functions to reduce omissions.
- Use typed schemas and validated inputs for create/update actions.
- Use transactions for multi-step finance and academic operations.
- Do not expose database connection strings or secrets to client components.
- Do not make a database query directly from a client component.
- Use server components for initial data reads where practical; use client components only for interactivity.
- Paginate list pages and index columns used for tenant, branch, date, status and search.
- Return safe error messages to users; log diagnostic details server-side without passwords or sensitive tokens.

## 4. Environment variables
`.env.example` should document names only, with placeholder values:
- `DATABASE_URL`
- `SESSION_SECRET` (high-entropy random secret)
- `APP_URL`
- Optional email provider variables only when password-reset email is implemented.

Never commit real secrets. Neon connection strings must be stored in deployment secrets.

## 5. Database approach
- Use Neon PostgreSQL with Drizzle ORM.
- Keep schema definitions under `src/db/schema`.
- Use `drizzle-kit` for generated migrations.
- Review migration SQL before applying it.
- Development seed data must be synthetic and must not include real student records.
- Use database constraints for uniqueness and relationships where possible; application validation alone is insufficient.

## 6. Error handling and observability
- Add a standard error response pattern for server actions/API routes.
- Add structured server logs for unexpected failures and security-relevant events.
- Never log passwords, session tokens, reset tokens, or full payment details.
- Include a basic health endpoint that reports application status without exposing secrets or database internals.
