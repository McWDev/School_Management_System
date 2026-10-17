import "server-only";
import { z } from "zod";

/*
 * Server-side environment, validated once on first use. Never import this
 * from a client component: it holds secrets ("server-only" enforces that).
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Pooled Neon connection string used by the application. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Public base URL of the app, e.g. https://school.example.com. */
  APP_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parse server env vars, throwing a message that names missing keys but never values. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration: ${problems}`);
  }
  return result.data;
}

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
