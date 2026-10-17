/*
 * Integration tests run against the Neon "development" branch configured in
 * .env.local (or the process environment). They create synthetic records with
 * unique codes and remove them afterwards. Never point these at production.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local; rely on the process environment.
}

if (process.env.NEON_BRANCH === "production") {
  throw new Error("Refusing to run integration tests against the production branch.");
}

export const hasDatabase = Boolean(process.env.DATABASE_URL);
if (!hasDatabase) console.warn("DATABASE_URL not set: skipping database integration tests.");

/** Short unique suffix for codes created by a test run, e.g. "K3F9Q2". */
export function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
