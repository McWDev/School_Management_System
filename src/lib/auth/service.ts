import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { passwordResetTokens, sessions, tenants, users, type User } from "@/db/schema";
import type { TenantStatus } from "@/db/schema";
import { ConflictError, isUniqueViolation } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseInput } from "@/lib/validation";
import {
  getAuthConfig,
  LOGIN_IP_WINDOW_SECONDS,
  PASSWORD_RESET_TTL_MS,
  RATE_LIMITS,
  SESSION_TOUCH_INTERVAL_MS,
} from "./config";
import { hashPassword, newPasswordSchema, verifyDummyPassword, verifyPassword } from "./password";
import { hitRateLimit, peekRateLimit, resetRateLimit } from "./rate-limit";
import { generateToken, hashIdentifier, hashToken } from "./tokens";

/*
 * Core authentication logic (07-Authentication-Roles-Security.md §1). No
 * Next.js request APIs here; src/lib/auth/session.ts adapts it to cookies.
 */

/** What the rest of the app knows about the signed-in user. Keep it narrow. */
export type SessionUser = {
  id: string;
  email: string | null;
  username: string | null;
  fullName: string;
  /** null for platform-level users. */
  tenantId: string | null;
  sessionId: string;
};

export type LoginFailure =
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "account_disabled" }
  | { ok: false; reason: "school_inactive"; schoolStatus: TenantStatus };

export type LoginResult =
  { ok: true; token: string; expiresAt: Date; user: SessionUser } | LoginFailure;

const loginSchema = z.object({
  /** Email address, or the username a school gave a staff member. */
  identifier: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(1024),
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address."));

/** Rate-limit key for an account (email or username), never stored raw. */
function emailKey(identifier: string) {
  return `login:email:${hashIdentifier(identifier, getAuthConfig().sessionSecret)}`;
}

// ------------------------------------------------------------------ users

const createUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, "Enter the full name.").max(200),
  password: newPasswordSchema,
  tenantId: z.uuid().nullable(),
});

/**
 * Create a user with a hashed password. Callers must authorize this
 * (user management with permissions arrives in Task 06; seed/tests call it directly).
 */
export async function createUser(input: z.input<typeof createUserSchema>): Promise<User> {
  const data = parseInput(createUserSchema, input);
  const passwordHash = await hashPassword(data.password);
  try {
    const [user] = await getDb()
      .insert(users)
      .values({
        email: data.email,
        fullName: data.fullName,
        tenantId: data.tenantId,
        passwordHash,
        passwordChangedAt: new Date(),
      })
      .returning();
    return user;
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique")) {
      throw new ConflictError("A user with this email already exists.", {
        email: ["A user with this email already exists."],
      });
    }
    throw error;
  }
}

/** Disable or re-enable a user. Disabling revokes every session immediately. */
export async function setUserStatus(userId: string, status: User["status"]): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ status }).where(eq(users.id, userId));
    if (status === "disabled") {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "user_disabled" })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    }
  });
}

// ---------------------------------------------------------------- sessions

export async function login(
  input: { identifier: string; password: string },
  meta: { ip: string; userAgent?: string | null },
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  const { identifier, password } = parsed.data;
  const email = identifier;
  // Emails contain "@"; usernames never do.
  const byIdentifier = identifier.includes("@")
    ? eq(users.email, identifier)
    : eq(users.username, identifier);

  // Independent reads run in parallel (each is a network round trip). The
  // rate limits are still checked before the password is verified.
  const [ipState, emailState, [row]] = await Promise.all([
    hitRateLimit(`login:ip:${meta.ip}`, {
      limit: getAuthConfig().loginIpLimit,
      windowSeconds: LOGIN_IP_WINDOW_SECONDS,
    }),
    peekRateLimit(emailKey(email), RATE_LIMITS.loginPerEmail),
    getDb()
      .select({ user: users, tenantStatus: tenants.status })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(byIdentifier),
  ]);
  if (ipState.limited) {
    logger.warn("auth.login_rate_limited", { scope: "ip" });
    return { ok: false, reason: "rate_limited", retryAfterSeconds: ipState.retryAfterSeconds };
  }
  if (emailState.limited) {
    logger.warn("auth.login_rate_limited", { scope: "account" });
    return { ok: false, reason: "rate_limited", retryAfterSeconds: emailState.retryAfterSeconds };
  }

  const passwordOk = row
    ? await verifyPassword(row.user.passwordHash, password)
    : await verifyDummyPassword(password);

  if (!row || !passwordOk) {
    await hitRateLimit(emailKey(email), RATE_LIMITS.loginPerEmail);
    logger.info("auth.login_failed", { userId: row?.user.id ?? null });
    return { ok: false, reason: "invalid_credentials" };
  }

  // The password is correct, so specific messages no longer leak account existence.
  if (row.user.status !== "active") {
    logger.info("auth.login_refused", { userId: row.user.id, reason: "account_disabled" });
    return { ok: false, reason: "account_disabled" };
  }
  if (row.user.tenantId && row.tenantStatus !== "active") {
    logger.info("auth.login_refused", { userId: row.user.id, reason: "school_inactive" });
    return { ok: false, reason: "school_inactive", schoolStatus: row.tenantStatus ?? "archived" };
  }

  const [created] = await Promise.all([
    createSession(row.user.id, meta.userAgent),
    resetRateLimit(emailKey(email)),
    getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.user.id)),
  ]);
  logger.info("auth.login_succeeded", { userId: row.user.id });

  return {
    ok: true,
    token: created.token,
    expiresAt: created.expiresAt,
    user: {
      id: row.user.id,
      email: row.user.email,
      username: row.user.username,
      fullName: row.user.fullName,
      tenantId: row.user.tenantId,
      sessionId: created.sessionId,
    },
  };
}

async function createSession(userId: string, userAgent?: string | null) {
  const config = getAuthConfig();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + config.maxAgeMs);
  const [session] = await getDb()
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token, config.sessionSecret, "session"),
      expiresAt,
      userAgent: userAgent?.slice(0, 200) ?? null,
    })
    .returning({ id: sessions.id });
  return { token, expiresAt, sessionId: session.id };
}

/**
 * Resolve a raw session token to its user, or null. Rejects revoked, expired
 * and idle sessions, disabled users and users of inactive schools — on every
 * call, so revocation takes effect immediately.
 */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const config = getAuthConfig();
  const idleCutoff = new Date(Date.now() - config.idleTimeoutMs);

  const [row] = await getDb()
    .select({
      sessionId: sessions.id,
      lastUsedAt: sessions.lastUsedAt,
      id: users.id,
      email: users.email,
      username: users.username,
      fullName: users.fullName,
      tenantId: users.tenantId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token, config.sessionSecret, "session")),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.lastUsedAt, idleCutoff),
        eq(users.status, "active"),
        or(isNull(users.tenantId), eq(tenants.status, "active")),
      ),
    );
  if (!row) return null;

  if (Date.now() - row.lastUsedAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await getDb()
      .update(sessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
  }
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.fullName,
    tenantId: row.tenantId,
    sessionId: row.sessionId,
  };
}

export async function revokeSessionToken(token: string, reason = "logout"): Promise<void> {
  if (!token || token.length > 100) return;
  const { sessionSecret } = getAuthConfig();
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token, sessionSecret, "session")),
        isNull(sessions.revokedAt),
      ),
    );
}

export async function revokeAllUserSessions(userId: string, reason: string): Promise<number> {
  const revoked = await getDb()
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length;
}

// ------------------------------------------------------------ password reset

/**
 * Create a single-use reset token for a user and return the raw token once.
 * Earlier unused tokens for the user are invalidated. Delivery (email) is not
 * configured yet; an administrator shares the link (see README).
 */
export async function createPasswordResetToken(
  userId: string,
  ttlMs: number = PASSWORD_RESET_TTL_MS,
): Promise<{ token: string; expiresAt: Date }> {
  const { sessionSecret } = getAuthConfig();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs);
  await getDb().transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(token, sessionSecret, "reset"),
      expiresAt,
    });
  });
  return { token, expiresAt };
}

const resetSchema = z.object({ token: z.string().min(1).max(100), password: newPasswordSchema });

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: "invalid_token" | "rate_limited"; retryAfterSeconds?: number };

/** Consume a reset token, set the new password and revoke every session of the user. */
export async function resetPassword(
  input: { token: string; password: string },
  meta: { ip: string },
): Promise<ResetResult> {
  const ipState = await hitRateLimit(`reset:ip:${meta.ip}`, RATE_LIMITS.resetPerIp);
  if (ipState.limited) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: ipState.retryAfterSeconds };
  }
  const { token, password } = parseInput(resetSchema, input);
  const { sessionSecret } = getAuthConfig();
  const passwordHash = await hashPassword(password);

  const userId = await getDb().transaction(async (tx) => {
    // Mark used atomically: only one request can consume a token.
    const [consumed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(token, sessionSecret, "reset")),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!consumed) return null;

    const [user] = await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(and(eq(users.id, consumed.userId), eq(users.status, "active")))
      .returning({ id: users.id });
    if (!user) return null;

    await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: "password_reset" })
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    return user.id;
  });

  if (!userId) return { ok: false, reason: "invalid_token" };
  logger.info("auth.password_reset", { userId });
  return { ok: true };
}
