// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { eq, inArray, like, sql } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { authRateLimits, passwordResetTokens, sessions, users } from "@/db/schema";
import { changeSchoolStatus, registerSchool } from "@/features/tenants/repository";
import { getAuthConfig } from "@/lib/auth/config";
import { hitRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import * as auth from "@/lib/auth/service";
import { hashIdentifier } from "@/lib/auth/tokens";
import { ConflictError, ValidationError } from "@/lib/errors";
import { createPlatformContext } from "@/lib/tenant-context";

/*
 * Custom authentication against the Neon development branch
 * (Task 05 acceptance: unauthenticated access blocked, sessions hashed,
 * revocation works, disabled users lose access, abuse protection).
 */
describe.skipIf(!hasDatabase)("authentication", () => {
  const run = uniqueSuffix().toLowerCase();
  const ip = `test-${run}`;
  const meta = { ip, userAgent: "vitest" };
  const password = "integration-pass 123";
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const emailOf = (name: string) => `${name}.${run}@auth-test.example`;

  let activeSchoolId: string;
  let pendingSchoolId: string;

  async function makeUser(name: string, tenantId: string | null) {
    const user = await auth.createUser({
      email: emailOf(name),
      fullName: `Test ${name}`,
      password,
      tenantId,
    });
    userIds.push(user.id);
    return user;
  }

  async function loginOk(email: string, pw = password) {
    const result = await auth.login({ identifier: email, password: pw }, meta);
    if (!result.ok) throw new Error(`expected login to succeed, got ${result.reason}`);
    return result;
  }

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `AUTH-${run.toUpperCase()}-${code}`,
      name: `Auth Test ${code}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const active = await registerSchool(platform, school("A"));
    const pending = await registerSchool(platform, school("P"));
    tenantIds.push(active.id, pending.id);
    await changeSchoolStatus(platform, active.id, { action: "approve" });
    activeSchoolId = active.id;
    pendingSchoolId = pending.id;
  });

  afterAll(async () => {
    const db = getDb();
    const { sessionSecret } = getAuthConfig();
    const emailKeys = ["alice", "bob", "carol", "dave", "erin", "frank", "pat", "plat", "rate"].map(
      (n) => `login:email:${hashIdentifier(emailOf(n), sessionSecret)}`,
    );
    await db.delete(authRateLimits).where(inArray(authRateLimits.key, emailKeys));
    await db.delete(authRateLimits).where(like(authRateLimits.key, `%${ip}%`));
    await deleteTestData(tenantIds, userIds);
    await getPool().end();
  });

  describe("users", () => {
    it("stores an Argon2id hash, never the password", async () => {
      const user = await makeUser("alice", activeSchoolId);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(password);
    });

    it("rejects duplicate emails case-insensitively", async () => {
      await expect(
        auth.createUser({
          email: emailOf("alice").toUpperCase(),
          fullName: "Dup",
          password,
          tenantId: activeSchoolId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects weak passwords", async () => {
      await expect(
        auth.createUser({
          email: emailOf("weak"),
          fullName: "Weak",
          password: "short",
          tenantId: null,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("login and sessions", () => {
    it("signs in, stores only a token hash, and resolves the session", async () => {
      const result = await loginOk(emailOf("alice"));
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const [row] = await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.id, result.user.sessionId));
      expect(row.tokenHash).not.toBe(result.token);
      expect(row.tokenHash).not.toContain(result.token);
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const user = await auth.validateSessionToken(result.token);
      expect(user).toMatchObject({ email: emailOf("alice"), tenantId: activeSchoolId });
    });

    it("accepts the email in any case", async () => {
      await loginOk(`  ${emailOf("alice").toUpperCase()} `);
    });

    it("gives the same generic failure for a wrong password and an unknown email", async () => {
      const wrongPassword = await auth.login(
        { identifier: emailOf("alice"), password: "not the password" },
        meta,
      );
      const unknownEmail = await auth.login({ identifier: emailOf("nobody"), password }, meta);
      expect(wrongPassword).toEqual({ ok: false, reason: "invalid_credentials" });
      expect(unknownEmail).toEqual({ ok: false, reason: "invalid_credentials" });
    });

    it("rejects tokens that were never issued", async () => {
      expect(await auth.validateSessionToken("x".repeat(43))).toBeNull();
      expect(await auth.validateSessionToken("")).toBeNull();
    });

    it("signs in a platform-level user without a school", async () => {
      await makeUser("plat", null);
      const result = await loginOk(emailOf("plat"));
      expect((await auth.validateSessionToken(result.token))?.tenantId).toBeNull();
    });
  });

  describe("revocation and expiry", () => {
    it("ends the session on logout", async () => {
      const result = await loginOk(emailOf("alice"));
      await auth.revokeSessionToken(result.token);
      expect(await auth.validateSessionToken(result.token)).toBeNull();
      await expect(auth.revokeSessionToken(result.token)).resolves.toBeUndefined();
    });

    it("revokes every session of a user", async () => {
      const bob = await makeUser("bob", activeSchoolId);
      const first = await loginOk(emailOf("bob"));
      const second = await loginOk(emailOf("bob"));
      expect(await auth.revokeAllUserSessions(bob.id, "test")).toBeGreaterThanOrEqual(2);
      expect(await auth.validateSessionToken(first.token)).toBeNull();
      expect(await auth.validateSessionToken(second.token)).toBeNull();
    });

    it("locks out a disabled user immediately, including existing sessions", async () => {
      const carol = await makeUser("carol", activeSchoolId);
      const session = await loginOk(emailOf("carol"));
      await auth.setUserStatus(carol.id, "disabled");

      expect(await auth.validateSessionToken(session.token)).toBeNull();
      expect(await auth.login({ identifier: emailOf("carol"), password }, meta)).toEqual({
        ok: false,
        reason: "account_disabled",
      });

      await auth.setUserStatus(carol.id, "active");
      expect(await auth.validateSessionToken(session.token)).toBeNull(); // stays revoked
      await loginOk(emailOf("carol"));
    });

    it("expires sessions after the absolute lifetime", async () => {
      const result = await loginOk(emailOf("alice"));
      await getDb()
        .update(sessions)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(sessions.id, result.user.sessionId));
      expect(await auth.validateSessionToken(result.token)).toBeNull();
    });

    it("expires sessions after the idle timeout", async () => {
      const result = await loginOk(emailOf("alice"));
      const idleMinutes = getAuthConfig().idleTimeoutMs / 60_000;
      await getDb()
        .update(sessions)
        .set({ lastUsedAt: sql`now() - make_interval(mins => ${idleMinutes + 1})` })
        .where(eq(sessions.id, result.user.sessionId));
      expect(await auth.validateSessionToken(result.token)).toBeNull();
    });
  });

  describe("school status", () => {
    it("refuses sign-in for a pending school, only after a correct password", async () => {
      await makeUser("pat", pendingSchoolId);
      expect(
        await auth.login({ identifier: emailOf("pat"), password: "wrong password" }, meta),
      ).toEqual({
        ok: false,
        reason: "invalid_credentials",
      });
      expect(await auth.login({ identifier: emailOf("pat"), password }, meta)).toEqual({
        ok: false,
        reason: "school_inactive",
        schoolStatus: "pending",
      });
    });

    it("blocks existing sessions while a school is suspended", async () => {
      await makeUser("dave", activeSchoolId);
      const session = await loginOk(emailOf("dave"));
      await changeSchoolStatus(platform, activeSchoolId, { action: "suspend", reason: "test" });
      try {
        expect(await auth.validateSessionToken(session.token)).toBeNull();
      } finally {
        await changeSchoolStatus(platform, activeSchoolId, { action: "reactivate" });
      }
    });
  });

  describe("abuse protection", () => {
    it("locks an account after 5 failed attempts, even with the right password", async () => {
      await makeUser("rate", activeSchoolId);
      for (let i = 0; i < 5; i++) {
        const failed = await auth.login(
          { identifier: emailOf("rate"), password: "wrong one!!" },
          meta,
        );
        expect(failed).toMatchObject({ reason: "invalid_credentials" });
      }
      const blocked = await auth.login({ identifier: emailOf("rate"), password }, meta);
      expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
      expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
    });

    it("counts events per key in a fixed window that resets", async () => {
      const key = `test:${ip}:window`;
      const rule = { limit: 2, windowSeconds: 1 };
      expect((await hitRateLimit(key, rule)).limited).toBe(false);
      expect((await hitRateLimit(key, rule)).limited).toBe(false);
      expect((await hitRateLimit(key, rule)).limited).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      expect((await hitRateLimit(key, rule)).count).toBe(1);
      await resetRateLimit(key);
    });
  });

  describe("password reset", () => {
    it("is single-use, sets the new password and revokes all sessions", async () => {
      const erin = await makeUser("erin", activeSchoolId);
      const session = await loginOk(emailOf("erin"));
      const { token } = await auth.createPasswordResetToken(erin.id);

      const [stored] = await getDb()
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, erin.id));
      expect(stored.tokenHash).not.toContain(token);

      const newPassword = "a brand new pass 99";
      expect(await auth.resetPassword({ token, password: newPassword }, meta)).toEqual({
        ok: true,
      });
      expect(await auth.validateSessionToken(session.token)).toBeNull();
      expect(await auth.login({ identifier: emailOf("erin"), password }, meta)).toMatchObject({
        reason: "invalid_credentials",
      });
      await loginOk(emailOf("erin"), newPassword);

      expect(await auth.resetPassword({ token, password: "another pass 1234" }, meta)).toEqual({
        ok: false,
        reason: "invalid_token",
      });
    });

    it("invalidates older links and rejects expired ones", async () => {
      const frank = await makeUser("frank", activeSchoolId);
      const first = await auth.createPasswordResetToken(frank.id);
      const second = await auth.createPasswordResetToken(frank.id);
      expect(
        await auth.resetPassword({ token: first.token, password: "new pass first 1" }, meta),
      ).toEqual({
        ok: false,
        reason: "invalid_token",
      });

      await getDb()
        .update(passwordResetTokens)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(passwordResetTokens.userId, frank.id));
      expect(
        await auth.resetPassword({ token: second.token, password: "new pass second 2" }, meta),
      ).toEqual({
        ok: false,
        reason: "invalid_token",
      });
    });

    it("validates the new password", async () => {
      const [alice] = await getDb()
        .select()
        .from(users)
        .where(eq(users.email, emailOf("alice")));
      const { token } = await auth.createPasswordResetToken(alice.id);
      await expect(auth.resetPassword({ token, password: "short" }, meta)).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });
});
