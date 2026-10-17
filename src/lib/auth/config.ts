import "server-only";
import { z } from "zod";

/*
 * Authentication settings (07-Authentication-Roles-Security.md §8).
 * Defaults: sessions end after 8 hours without activity, and at most 7 days
 * after sign-in. Both are configurable through environment variables.
 */
const authEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** HMAC key for hashing session and reset tokens. ≥ 32 characters. */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters."),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(7 * 24 * 60)
    .default(480),
  SESSION_MAX_AGE_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(90 * 24)
    .default(168),
  /** Override Secure cookies (defaults to on in production). */
  AUTH_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  /** Login attempts allowed per IP per 15 minutes (default 50). */
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().min(5).max(100_000).default(50),
});

export type AuthConfig = {
  sessionSecret: string;
  idleTimeoutMs: number;
  maxAgeMs: number;
  secureCookies: boolean;
  cookieName: string;
  loginIpLimit: number;
};

let cached: AuthConfig | undefined;

export function parseAuthConfig(source: Record<string, string | undefined>): AuthConfig {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid authentication configuration: check ${keys.join(", ")}.`);
  }
  const env = result.data;
  const secureCookies =
    env.AUTH_COOKIE_SECURE !== undefined
      ? env.AUTH_COOKIE_SECURE === "true"
      : env.NODE_ENV === "production";
  return {
    sessionSecret: env.SESSION_SECRET,
    idleTimeoutMs: env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000,
    maxAgeMs: env.SESSION_MAX_AGE_HOURS * 3_600_000,
    secureCookies,
    // The __Host- prefix makes browsers require Secure, Path=/ and no Domain.
    cookieName: secureCookies ? "__Host-sms_session" : "sms_session",
    loginIpLimit: env.AUTH_LOGIN_IP_LIMIT,
  };
}

export function getAuthConfig(): AuthConfig {
  cached ??= parseAuthConfig(process.env);
  return cached;
}

/** Login and reset abuse limits (fixed windows). The per-IP login limit is in AuthConfig. */
export const RATE_LIMITS = {
  loginPerEmail: { limit: 5, windowSeconds: 15 * 60 },
  resetPerIp: { limit: 10, windowSeconds: 15 * 60 },
} as const;

export const PASSWORD_RESET_TTL_MS = 30 * 60_000;
/** New accounts get a longer-lived link to set their first password. */
export const ACCOUNT_SETUP_TTL_MS = 24 * 3_600_000;
/** Don't write last_used_at on every request; idle timeout tolerance. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

export const LOGIN_IP_WINDOW_SECONDS = 15 * 60;
