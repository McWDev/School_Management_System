import { describe, expect, it } from "vitest";
import { isTenantOperational, resolveTenantTransition } from "@/features/tenants/status";

describe("school registration status workflow", () => {
  it.each([
    ["pending", "approve", undefined, "active"],
    ["pending", "reject", "Duplicate registration", "archived"],
    ["active", "suspend", "Unpaid subscription", "suspended"],
    ["suspended", "reactivate", undefined, "active"],
    ["suspended", "archive", "School closed", "archived"],
  ] as const)("%s + %s → %s", (from, action, reason, to) => {
    expect(resolveTenantTransition(from, action, reason)).toEqual({ ok: true, to });
  });

  it.each([
    ["active", "approve"],
    ["pending", "suspend"],
    ["pending", "reactivate"],
    ["active", "archive"],
    ["archived", "reactivate"],
    ["archived", "approve"],
  ] as const)("rejects %s + %s", (from, action) => {
    expect(resolveTenantTransition(from, action, "some reason")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });

  it.each(["reject", "suspend"] as const)("requires a non-blank reason to %s", (action) => {
    const from = action === "reject" ? "pending" : "active";
    expect(resolveTenantTransition(from, action)).toEqual({ ok: false, reason: "reason_required" });
    expect(resolveTenantTransition(from, action, "   ")).toEqual({
      ok: false,
      reason: "reason_required",
    });
  });

  it("treats only active schools as operational", () => {
    expect(isTenantOperational("active")).toBe(true);
    for (const status of ["pending", "suspended", "archived"] as const) {
      expect(isTenantOperational(status)).toBe(false);
    }
  });
});
