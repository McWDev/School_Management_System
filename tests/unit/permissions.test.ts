// @vitest-environment node
import { describe, expect, it } from "vitest";
import { redact } from "@/lib/audit";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PLATFORM_PERMISSIONS,
  TENANT_PERMISSIONS,
} from "@/lib/permissions/catalog";
import { PLATFORM_PRESETS, SCHOOL_PRESETS } from "@/lib/permissions/presets";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

const TENANT = "11111111-1111-4111-8111-111111111111";

describe("permission catalog", () => {
  it("contains every key from 07-Authentication-Roles-Security.md", () => {
    for (const key of [
      "dashboard.read",
      "schools.activate",
      "branches.archive",
      "students.archive",
      "fees.reverse_payment",
      "exams.publish_results",
      "attendance.correct",
      "reports.export",
      "users.manage",
      "roles.manage",
      "audit_logs.read",
      "settings.manage",
    ]) {
      expect(ALL_PERMISSIONS).toContain(key);
    }
  });

  it("uses <area>.<action> keys and a single scope each", () => {
    for (const key of ALL_PERMISSIONS) expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
    expect(TENANT_PERMISSIONS.length + PLATFORM_PERMISSIONS.length).toBe(ALL_PERMISSIONS.length);
  });
});

describe("role presets", () => {
  it("only use permissions of their own scope", () => {
    for (const preset of SCHOOL_PRESETS) {
      for (const p of preset.permissions) expect(PERMISSIONS[p].scope).toBe("tenant");
    }
    for (const preset of PLATFORM_PRESETS) {
      for (const p of preset.permissions) expect(PERMISSIONS[p].scope).toBe("platform");
    }
  });

  it("matches the documented responsibilities", () => {
    const byKey = Object.fromEntries(SCHOOL_PRESETS.map((p) => [p.key, new Set(p.permissions)]));
    expect([...byKey.school_admin].sort()).toEqual([...TENANT_PERMISSIONS].sort());
    expect(byKey.branch_admin.has("users.manage")).toBe(false);
    expect(byKey.branch_admin.has("branches.create")).toBe(false);
    expect(byKey.branch_admin.has("students.create")).toBe(true);
    expect(byKey.teacher.has("attendance.take")).toBe(true);
    expect(byKey.teacher.has("fees.read")).toBe(false);
    expect(byKey.finance_officer.has("fees.record_payment")).toBe(true);
    expect(byKey.finance_officer.has("exams.enter_marks")).toBe(false);
    expect([...byKey.auditor].every((p) => p.endsWith(".read"))).toBe(true);
    expect(byKey.auditor.has("audit_logs.read")).toBe(true);
    // School Staff is School Admin only (product owner, 2026-10-17).
    expect(byKey.school_admin.has("staff.manage")).toBe(true);
    for (const key of ["branch_admin", "teacher", "finance_officer", "registrar", "auditor"]) {
      expect(byKey[key].has("staff.read")).toBe(false);
    }
  });

  it("gives the platform super admin no access to school records", () => {
    const platform = new Set(PLATFORM_PRESETS[0].permissions);
    expect([...platform].some((p) => PERMISSIONS[p].scope === "tenant")).toBe(false);
  });

  it("locks the School Admin preset so schools cannot lock themselves out", () => {
    expect(SCHOOL_PRESETS.find((p) => p.key === "school_admin")?.locked).toBe(true);
  });
});

describe("context permissions", () => {
  it("drops unknown keys and keys of the wrong scope", () => {
    const tenant = createTenantContext({
      tenantId: TENANT,
      branchScope: "all",
      permissions: ["students.read", "schools.suspend", "made.up"],
    });
    expect([...tenant.permissions]).toEqual(["students.read"]);
    const platform = createPlatformContext({ permissions: ["schools.read", "students.read"] });
    expect([...platform.permissions]).toEqual(["schools.read"]);
  });
});

describe("audit redaction", () => {
  it("removes secrets at any depth and keeps other fields", () => {
    const out = redact({
      email: "a@b.example",
      passwordHash: "$argon2id$...",
      nested: { resetToken: "abc", name: "x", list: [{ sessionTokenHash: "h" }] },
      when: new Date("2026-01-02T03:04:05Z"),
    });
    expect(out).toEqual({
      email: "a@b.example",
      passwordHash: "[redacted]",
      nested: { resetToken: "[redacted]", name: "x", list: [{ sessionTokenHash: "[redacted]" }] },
      when: "2026-01-02T03:04:05.000Z",
    });
  });
});
