import "server-only";

/*
 * Minimal structured server logger (03-Architecture.md §6). Writes one JSON
 * line per event. Never pass passwords, tokens, connection strings or student
 * personal data in `context`.
 */
type Level = "info" | "warn" | "error";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
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
