/**
 * Upgrade a Postgres URL to `sslmode=verify-full` (certificate + hostname check).
 * Neon issues `sslmode=require`, which node-postgres warns will change meaning;
 * verify-full is the strictest mode and is supported by Neon's certificates.
 * Shared by the app (src/db/index.ts) and drizzle.config.ts.
 */
export function withVerifiedSsl(connectionString: string): string {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (mode === null || mode === "require" || mode === "prefer") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
