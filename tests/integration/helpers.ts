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

/**
 * Test-only hard delete of synthetic schools and everything hanging off them
 * (the application itself never hard-deletes). Also removes listed
 * platform-level users.
 */
export async function deleteTestData(tenantIds: string[], platformUserIds: string[] = []) {
  const { inArray, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const schema = await import("@/db/schema");
  const db = getDb();
  const userIds = [
    ...platformUserIds,
    ...(tenantIds.length
      ? (
          await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(inArray(schema.users.tenantId, tenantIds))
        ).map((u) => u.id)
      : []),
  ];
  if (tenantIds.length || userIds.length) {
    const conditions = [
      tenantIds.length ? inArray(schema.auditLogs.tenantId, tenantIds) : undefined,
      userIds.length ? inArray(schema.auditLogs.actorUserId, userIds) : undefined,
    ].filter((c) => c !== undefined);
    await db.delete(schema.auditLogs).where(or(...conditions));
  }
  if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  if (tenantIds.length) {
    await db.delete(schema.roles).where(inArray(schema.roles.tenantId, tenantIds));
    await db.delete(schema.branches).where(inArray(schema.branches.tenantId, tenantIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
  }
}
