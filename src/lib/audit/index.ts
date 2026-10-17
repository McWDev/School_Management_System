import "server-only";
import { getDb, type Database } from "@/db";
import { auditLogs } from "@/db/schema";

/*
 * Audit trail (07-Authentication-Roles-Security.md §6). Write the entry in the
 * same transaction as the change it describes, so neither exists without the
 * other. Snapshots are redacted: secrets never reach the audit log.
 */

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AuditEntry = {
  tenantId: string | null;
  actorUserId?: string | null;
  /** "<entity>.<verb>", e.g. "branch.archived", "user.disabled". */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

const SENSITIVE_KEY = /password|token|secret|hash/i;

/** Deep copy with sensitive fields replaced, dates as ISO strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 6) return "[truncated]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Set) return [...value].map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(inner, depth + 1);
    }
    return out;
  }
  return value;
}

export async function recordAudit(entry: AuditEntry, executor: Executor = getDb()): Promise<void> {
  await executor.insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    beforeData: entry.before === undefined ? null : redact(entry.before),
    afterData: entry.after === undefined ? null : redact(entry.after),
    reason: entry.reason?.trim() || null,
  });
}
