/*
 * Minimal structured server logger (03-Architecture.md §6). Writes one JSON
 * line per event. Never pass passwords, tokens, connection strings or student
 * personal data in `context`.
 */
type Level = "info" | "warn" | "error";

/**
 * Remove query parameters from database error text. Drizzle's query errors
 * embed "params: ..." (emails, names, password hashes); they must never reach logs.
 */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/\nparams:[\s\S]*$/, "\nparams: [redacted]")
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]");
}

/** Safe summary of an error, including the underlying cause (e.g. the Postgres error code). */
export function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: scrubErrorMessage(String(error)) };
  const pg = error as Error & { code?: unknown; constraint?: unknown };
  const out: Record<string, unknown> = {
    name: error.name,
    message: scrubErrorMessage(error.message),
    ...(typeof pg.code === "string" ? { code: pg.code } : {}),
    ...(typeof pg.constraint === "string" ? { constraint: pg.constraint } : {}),
    stack: error.stack ? scrubErrorMessage(error.stack) : undefined,
  };
  if (error.cause && depth < 3) out.cause = serializeError(error.cause, depth + 1);
  return out;
}

function write(level: Level, event: string, context: Record<string, unknown> = {}) {
  const entry: Record<string, unknown> = { level, event, time: new Date().toISOString() };
  for (const [key, value] of Object.entries(context)) {
    entry[key] = key === "error" ? serializeError(value) : value;
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, context?: Record<string, unknown>) => write("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => write("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => write("error", event, context),
};
