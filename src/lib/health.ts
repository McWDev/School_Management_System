import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { logger } from "@/lib/logger";

export type HealthReport = {
  status: "ok" | "degraded";
  checks: { database: "ok" | "unavailable" };
  timestamp: string;
};

const DB_TIMEOUT_MS = 10_000;

/** Application health. Reports only up/down per dependency, never internals. */
export async function checkHealth(): Promise<HealthReport> {
  let database: HealthReport["checks"]["database"] = "ok";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("database check timed out")), DB_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    database = "unavailable";
    logger.error("health.database_unavailable", { error });
  } finally {
    clearTimeout(timer);
  }
  return {
    status: database === "ok" ? "ok" : "degraded",
    checks: { database },
    timestamp: new Date().toISOString(),
  };
}
