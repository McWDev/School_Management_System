# Deployment and Operations

## 1. Environments
Maintain separate development and production configurations. Use a separate Neon database/branch for development and production where possible.

## 2. Deployment target
Recommended default: deploy the Next.js application to a Node.js-compatible hosting platform and use Neon for PostgreSQL. Verify the selected host supports the required Node.js runtime, environment variables, build process and secure cookies before production.

## 3. Environment configuration
- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_URL`
- Email provider credentials only when password reset email is implemented

Use `.env.local` for local development and hosting secret settings for production. Commit only `.env.example` placeholders.

## 4. Database migration procedure
1. Review migration SQL.
2. Apply migration to development.
3. Run tests and verify existing data.
4. Back up production data before risky migrations.
5. Apply reviewed migration to production using the documented release process.
6. Never use an unreviewed destructive migration in production.
7. Document rollback or forward-fix strategy.

## 5. Backups and recovery
- Confirm Neon backup/restore capabilities and retention settings for the selected plan.
- Document who can restore a database and how to verify restoration.
- Test restore procedure before relying on it.
- Exports are not a substitute for database backups.

## 6. Monitoring
- Track application errors and failed requests.
- Monitor database connection failures and slow queries.
- Avoid logging student details, passwords, session tokens or reset tokens.
- Provide a health endpoint without exposing sensitive diagnostics.

## 7. Release checklist
- All acceptance criteria pass.
- Production environment variables configured.
- Database migrations reviewed and applied.
- HTTPS active.
- Secure cookie settings verified.
- Rate limiting enabled for authentication endpoints.
- Seed/test data disabled in production.
- Admin account setup documented securely.
- Backup/restore procedure reviewed.
- Tenant and branch isolation tests pass.
- No critical/high security findings remain.
