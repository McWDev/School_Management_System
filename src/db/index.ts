import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
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
  // Recreate after pool.end() (e.g. between test files sharing a process).
  if (globalForDb.__smsPool?.ended) {
    globalForDb.__smsPool = undefined;
    globalForDb.__smsDb = undefined;
  }
  if (!globalForDb.__smsPool) {
    const pool = new Pool({
      connectionString: withVerifiedSsl(getServerEnv().DATABASE_URL),
      max: 10,
      idleTimeoutMillis: 30_000,
      // Neon computes scale to zero; the first connection after idle (cold start)
      // can take several seconds, longer on slow networks.
      connectionTimeoutMillis: 30_000,
      // Keep idle sockets alive so networks/NATs don't silently drop them
      // (seen as "read ECONNRESET" on the next query).
      keepAlive: true,
    });
    // A dropped idle connection must not crash the process; the pool replaces it.
    pool.on("error", (error) => logger.warn("db.idle_connection_error", { error }));
    globalForDb.__smsPool = pool;
  }
  return globalForDb.__smsPool;
}

export function getDb(): Database {
  globalForDb.__smsDb ??= drizzle(getPool(), { schema });
  return globalForDb.__smsDb;
}
