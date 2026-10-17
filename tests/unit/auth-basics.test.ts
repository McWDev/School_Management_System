// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loginFailureMessage, safeRedirectPath } from "@/features/auth/messages";
import { parseAuthConfig } from "@/lib/auth/config";
import { hashPassword, newPasswordSchema, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashIdentifier, hashToken } from "@/lib/auth/tokens";

const SECRET = "s".repeat(40);

describe("auth config", () => {
  it("uses safe defaults: 8h idle, 7 day absolute, insecure cookie outside production", () => {
    const config = parseAuthConfig({ SESSION_SECRET: SECRET, NODE_ENV: "development" });
    expect(config.idleTimeoutMs).toBe(8 * 3_600_000);
    expect(config.maxAgeMs).toBe(7 * 24 * 3_600_000);
    expect(config.secureCookies).toBe(false);
    expect(config.cookieName).toBe("sms_session");
  });

  it("uses Secure __Host- cookies in production", () => {
    const config = parseAuthConfig({ SESSION_SECRET: SECRET, NODE_ENV: "production" });
    expect(config.secureCookies).toBe(true);
    expect(config.cookieName).toBe("__Host-sms_session");
  });

  it("rejects a short secret without echoing it", () => {
    expect(() => parseAuthConfig({ SESSION_SECRET: "short-secret" })).toThrow(/SESSION_SECRET/);
    expect(() => parseAuthConfig({ SESSION_SECRET: "short-secret" })).not.toThrow(/short-secret/);
  });
});

describe("tokens", () => {
  it("generates long, unique, URL-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically, per purpose and per secret", () => {
    const token = generateToken();
    expect(hashToken(token, SECRET, "session")).toBe(hashToken(token, SECRET, "session"));
    expect(hashToken(token, SECRET, "session")).not.toBe(hashToken(token, SECRET, "reset"));
    expect(hashToken(token, SECRET, "session")).not.toBe(hashToken(token, `${SECRET}x`, "session"));
    expect(hashToken(token, SECRET, "session")).not.toContain(token);
  });

  it("never puts raw emails in identifier hashes", () => {
    expect(hashIdentifier("a@b.example", SECRET)).not.toContain("a@b");
  });
});

describe("passwords", () => {
  it("hashes with Argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password!!")).toBe(false);
  });

  it("treats a malformed hash as a failed check", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it.each([
    ["too short", "short1!"],
    ["only spaces padded", "   abc    "],
    ["repetitive", "aaaaaaaaaaaa"],
    ["too long", "x1".repeat(65)],
  ])("rejects a %s password", (_label, value) => {
    expect(newPasswordSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a reasonable passphrase", () => {
    expect(newPasswordSchema.safeParse("blue river morning 42").success).toBe(true);
  });
});

describe("login messages and redirects", () => {
  it("uses one generic message for wrong email or password", () => {
    expect(loginFailureMessage({ ok: false, reason: "invalid_credentials" })).toBe(
      "Incorrect email or password.",
    );
  });

  it.each([
    ["/students?page=2", "/students?page=2"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["/login", "/dashboard"],
    [null, "/dashboard"],
    ["", "/dashboard"],
  ])("safeRedirectPath(%j) → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
