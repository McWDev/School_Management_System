# CLAUDE.md

Project: multi-tenant School Management System (SaaS). Full specs live in the numbered docs (`01-PRD.md` … `13-Open-Questions.md`). Read them before coding.

## Stack
Next.js App Router + TypeScript (strict), Node.js runtime, Neon PostgreSQL, Drizzle ORM + Drizzle Kit, Zod, Tailwind CSS + shadcn/ui, Lucide, React Hook Form, Recharts, Vitest, React Testing Library, Playwright. Custom authentication only (no Clerk, Auth0, NextAuth/Auth.js).

Neon: org `org-shiny-butterfly-35748892`, project `autumn-bonus-18915899`.

## Mandatory rules (from 11-Claude-Code-Working-Rules.md)
1. Follow `10-Task-Roadmap.md` strictly: one task at a time; do not start later tasks.
2. Stop and wait for the user's review after each task.
3. Do not overwrite or remove existing work without inspecting it and explaining why.
4. Enforce authorization and tenant/branch isolation on the server for every protected read and write. Never trust IDs, tenant IDs or role names from the browser.
5. Validate inputs server-side with Zod.
6. Database changes go through reviewed, committed Drizzle migrations; no direct schema push to production.
7. Never hard-delete financial/academic history; archive or reverse instead.
8. Money uses numeric/decimal types, never floats.
9. No secrets in source, logs or committed files. `.env.local` is ignored; `.env.example` holds placeholders only.
10. Never claim a test, migration, deployment or DB connection succeeded unless it actually ran and succeeded.
11. If a secret or external account is unavailable, stop at that boundary and explain the manual step.
12. Synthetic data only in development and tests.
13. Provide loading, empty, error, success and validation states; follow accessibility and responsive rules.
14. No hardcoded dashboard statistics; no client-only permission checks; no unscoped queries; no raw session tokens or plaintext passwords stored.

## Completion report (after every task)
```text
Task:
Summary:
Files created/changed:
Database migrations:
Commands run:
Test results:
Security/permission checks:
Manual verification:
Known limitations:
Next task (do not start yet):
```
