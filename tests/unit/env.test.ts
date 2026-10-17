// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withVerifiedSsl } from "@/db/connection-url";
import { parseServerEnv } from "@/lib/env";

const validUrl =
  "postgresql://user:s3cret-value@ep-x-pooler.us-east-2.aws.neon.tech/db?sslmode=require";

describe("parseServerEnv", () => {
  it("accepts a valid configuration and defaults NODE_ENV", () => {
    const env = parseServerEnv({ DATABASE_URL: validUrl });
    expect(env.DATABASE_URL).toBe(validUrl);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a missing DATABASE_URL, naming the key", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects non-Postgres URLs without echoing the value", () => {
    const bad = "https://user:s3cret-value@example.com/db";
    try {
      parseServerEnv({ DATABASE_URL: bad });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/DATABASE_URL/);
      expect((error as Error).message).not.toContain("s3cret-value");
    }
  });
});

describe("withVerifiedSsl", () => {
  it("upgrades sslmode=require to verify-full and keeps other params", () => {
    const url = new URL(withVerifiedSsl(`${validUrl}&channel_binding=require`));
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("channel_binding")).toBe("require");
    expect(url.password).toBe("s3cret-value");
  });

  it("adds verify-full when sslmode is missing", () => {
    const url = new URL(withVerifiedSsl("postgresql://u:p@host/db"));
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("leaves an explicit stricter or disabled mode alone", () => {
    expect(withVerifiedSsl("postgresql://u:p@host/db?sslmode=verify-ca")).toContain(
      "sslmode=verify-ca",
    );
    expect(withVerifiedSsl("postgresql://u:p@localhost/db?sslmode=disable")).toContain(
      "sslmode=disable",
    );
  });
});
