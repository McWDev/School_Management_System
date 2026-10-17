# Claude Code Working Rules

Paste these rules into the project instructions file (for example `CLAUDE.md`) before implementation.

## Mandatory rules
1. Read `README.md` and all numbered documentation before coding.
2. Follow `10-Task-Roadmap.md` strictly.
3. Implement only the current task; do not start later tasks.
4. Do not overwrite or remove existing work without inspecting it and explaining why.
5. Use TypeScript strict mode and keep code modular.
6. Use Next.js App Router, Node.js runtime, Neon PostgreSQL and Drizzle ORM unless the user approves a change.
7. Use custom authentication. Do not add Clerk, Auth0, NextAuth/Auth.js or another auth provider.
8. Enforce authorization and tenant/branch isolation on the server for every protected read and write.
9. Do not trust IDs or role names supplied by the browser.
10. Validate inputs server-side with Zod.
11. Use migrations for database changes; inspect generated SQL.
12. Do not hard-delete financial/academic history.
13. Do not put secrets in source code, logs, screenshots or committed files.
14. Never claim a test, migration, deployment or database connection succeeded unless it actually ran and succeeded.
15. If a required secret or external account is unavailable, stop at that boundary and explain the exact manual step.
16. Use synthetic data only in development and tests.
17. Provide loading, empty, error, success and validation states.
18. Follow accessibility and responsive UI requirements.
19. After each task, report files changed, commands run, exact results, limitations and manual verification.
20. Stop and wait for the user's review before proceeding to the next task.

## Required completion report
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

## Avoid
- One-shot generation of the entire system.
- Hardcoded dashboard statistics.
- Client-only permission checks.
- Unscoped database queries.
- Raw session tokens stored in the database.
- Plaintext passwords.
- Fake successful test results.
- Destructive migrations without review.
- Large unrelated refactors during a small task.
