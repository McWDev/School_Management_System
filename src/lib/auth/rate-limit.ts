import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authRateLimits } from "@/db/schema";

export type RateLimitRule = { limit: number; windowSeconds: number };
export type RateLimitState = { count: number; limited: boolean; retryAfterSeconds: number };

function toState(count: number, windowStart: Date, rule: RateLimitRule): RateLimitState {
  const resetAt = windowStart.getTime() + rule.windowSeconds * 1000;
  return {
    count,
    limited: count > rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

/**
 * Atomically count one event for `key` in a fixed window stored in Postgres
 * (works across serverless instances). A new window starts once the old one
 * has passed.
 */
export async function hitRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitState> {
  const interval = sql.raw(`interval '${Math.floor(rule.windowSeconds)} seconds'`);
  const [row] = await getDb()
    .insert(authRateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`case when ${authRateLimits.windowStart} <= now() - ${interval} then 1 else ${authRateLimits.count} + 1 end`,
        windowStart: sql`case when ${authRateLimits.windowStart} <= now() - ${interval} then now() else ${authRateLimits.windowStart} end`,
      },
    })
    .returning();

  // Opportunistic cleanup of long-expired counters.
  if (Math.random() < 0.02) {
    void getDb()
      .delete(authRateLimits)
      .where(lt(authRateLimits.windowStart, sql`now() - interval '1 day'`))
      .catch(() => {});
  }
  return toState(row.count, row.windowStart, rule);
}

/** Current state without counting an event. */
export async function peekRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitState> {
  const [row] = await getDb().select().from(authRateLimits).where(eq(authRateLimits.key, key));
  if (!row || row.windowStart.getTime() <= Date.now() - rule.windowSeconds * 1000) {
    return { count: 0, limited: false, retryAfterSeconds: 0 };
  }
  // "limited" for peek means the limit is already used up.
  return { ...toState(row.count, row.windowStart, rule), limited: row.count >= rule.limit };
}

export async function resetRateLimit(key: string): Promise<void> {
  await getDb().delete(authRateLimits).where(eq(authRateLimits.key, key));
}
