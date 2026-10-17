// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDatabase } from "./helpers";

/*
 * Runs against the real development database (Neon "development" branch).
 * Requires DATABASE_URL in .env.local (`neon checkout development`) or the
 * environment, and migrations applied (`npm run db:migrate`).
 */

describe.skipIf(!hasDatabase)("database (Neon development branch)", () => {
  afterAll(async () => {
    const { getPool } = await import("@/db");
    await getPool().end();
  });

  it("connects through the pooled connection and runs a query", async () => {
    const { getDb } = await import("@/db");
    const result = await getDb().execute<{ answer: number }>(sql`select 1 as answer`);
    expect(result.rows).toEqual([{ answer: 1 }]);
  });

  it("cannot connect without TLS", async () => {
    // Neon terminates TLS at its proxy (so pg_stat_ssl is not meaningful there);
    // prove encryption is enforced by showing a plaintext connection is refused.
    const { Client } = await import("pg");
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("sslmode", "disable");
    const client = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 15_000,
    });
    await expect(client.connect()).rejects.toThrow();
    await client.end().catch(() => {});
  });

  it("has the baseline migration applied", async () => {
    const { getDb } = await import("@/db");
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    expect(result.rows[0]?.count).toBeGreaterThanOrEqual(1);
  });

  it("reports healthy from the health check", async () => {
    const { checkHealth } = await import("@/lib/health");
    const report = await checkHealth();
    expect(report.status).toBe("ok");
    expect(report.checks.database).toBe("ok");
    // The report must not expose connection details.
    expect(JSON.stringify(report)).not.toMatch(/postgres|neon\.tech|password/i);
  });
});
