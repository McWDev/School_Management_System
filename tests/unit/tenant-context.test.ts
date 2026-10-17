// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  assertAllBranches,
  assertBranchInScope,
  canAccessBranch,
  createPlatformContext,
  createTenantContext,
} from "@/lib/tenant-context";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "22222222-2222-4222-8222-222222222222";
const BRANCH_B = "33333333-3333-4333-8333-333333333333";

describe("tenant context", () => {
  it("gives an all-branches actor access to any branch", () => {
    const ctx = createTenantContext({ tenantId: TENANT, branchScope: "all", permissions: "all" });
    expect(canAccessBranch(ctx, BRANCH_A)).toBe(true);
    expect(() => assertAllBranches(ctx)).not.toThrow();
  });

  it("limits a branch-scoped actor to their branches", () => {
    const ctx = createTenantContext({
      tenantId: TENANT,
      branchScope: [BRANCH_A],
      permissions: "all",
    });
    expect(canAccessBranch(ctx, BRANCH_A)).toBe(true);
    expect(canAccessBranch(ctx, BRANCH_B)).toBe(false);
    expect(() => assertBranchInScope(ctx, BRANCH_B)).toThrow(NotFoundError);
    expect(() => assertAllBranches(ctx)).toThrow(ForbiddenError);
  });

  it("rejects malformed ids so they never reach a query", () => {
    expect(() =>
      createTenantContext({ tenantId: "1 OR 1=1", branchScope: "all", permissions: "all" }),
    ).toThrow();
    expect(() =>
      createTenantContext({ tenantId: TENANT, branchScope: ["nope"], permissions: "all" }),
    ).toThrow();
  });

  it("is immutable", () => {
    const ctx = createTenantContext({ tenantId: TENANT, branchScope: "all", permissions: "all" });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(() => {
      (ctx as { tenantId: string }).tenantId = BRANCH_A;
    }).toThrow();
  });

  it("keeps platform and tenant contexts distinct", () => {
    expect(createPlatformContext({ permissions: "all" }).kind).toBe("platform");
    expect(
      createTenantContext({ tenantId: TENANT, branchScope: "all", permissions: "all" }).kind,
    ).toBe("tenant");
  });
});
