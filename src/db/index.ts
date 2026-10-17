import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "@/lib/env";
import { withVerifiedSsl } from "./connection-url";
import * as schema from "./schema";

/*
 * node-postgres pool over Neon's pooled (PgBouncer) connection string, as the
 * Neon skill recommends for Node.js apps. Supports interactive transactions,
 * which finance and academic workflows need.
 *
 * The pool is created lazily (so builds and imports never open connections)
 * and kept on globalThis so dev hot-reloads don't leak pools.
 */
export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __smsPool?: Pool; __smsDb?: Database };

export function getPool(): Pool {
  globalForDb.__smsPool ??= new Pool({
    connectionString: withVerifiedSsl(getServerEnv().DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30_000,
    // Neon computes scale to zero; the first connection after idle can take a moment.
    connectionTimeoutMillis: 15_000,
  });
  return globalForDb.__smsPool;
}

export function getDb(): Database {
  globalForDb.__smsDb ??= drizzle(getPool(), { schema });
  return globalForDb.__smsDb;
}
