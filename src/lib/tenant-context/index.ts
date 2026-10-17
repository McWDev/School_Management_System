import "server-only";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/*
 * Server-side access context (07-Authentication-Roles-Security.md §2, §5).
 *
 * Every tenant-owned read and write takes a TenantContext. It is built on the
 * server from the authenticated session (Task 05) and is never accepted from
 * the browser. Platform operations take a PlatformContext instead, so the two
 * cannot be confused at compile time.
 */

/** Which branches the actor may see inside their tenant. */
export type BranchScope =
  { readonly kind: "all" } | { readonly kind: "branches"; readonly branchIds: ReadonlySet<string> };

export type TenantContext = {
  readonly kind: "tenant";
  readonly tenantId: string;
  readonly branchScope: BranchScope;
  /** Acting user, for audit fields. Undefined only for system jobs. */
  readonly actorUserId?: string;
};

export type PlatformContext = {
  readonly kind: "platform";
  readonly actorUserId?: string;
};

const uuid = z.uuid();

export function createTenantContext(input: {
  tenantId: string;
  branchScope: "all" | readonly string[];
  actorUserId?: string;
}): TenantContext {
  const tenantId = uuid.parse(input.tenantId);
  const branchScope: BranchScope =
    input.branchScope === "all"
      ? { kind: "all" }
      : { kind: "branches", branchIds: new Set(input.branchScope.map((id) => uuid.parse(id))) };
  return Object.freeze({ kind: "tenant", tenantId, branchScope, actorUserId: input.actorUserId });
}

export function createPlatformContext(input: { actorUserId?: string } = {}): PlatformContext {
  return Object.freeze({ kind: "platform", actorUserId: input.actorUserId });
}

/** True when the actor may work with every branch of their school. */
export function hasAllBranches(ctx: TenantContext): boolean {
  return ctx.branchScope.kind === "all";
}

/** Branch scope check only; the caller must already have confirmed tenant ownership. */
export function canAccessBranch(ctx: TenantContext, branchId: string): boolean {
  return ctx.branchScope.kind === "all" || ctx.branchScope.branchIds.has(branchId);
}

/** Throw NotFound (not Forbidden) so out-of-scope branches look nonexistent. */
export function assertBranchInScope(ctx: TenantContext, branchId: string): void {
  if (!canAccessBranch(ctx, branchId)) throw new NotFoundError();
}

/** Only actors scoped to all branches may perform school-wide operations. */
export function assertAllBranches(ctx: TenantContext): void {
  if (!hasAllBranches(ctx)) throw new ForbiddenError();
}

/** WHERE condition restricting a tenant_id column to the context's tenant. */
export function tenantFilter(ctx: TenantContext, tenantIdColumn: AnyPgColumn): SQL {
  return eq(tenantIdColumn, ctx.tenantId);
}

/**
 * WHERE condition restricting a branch_id column to the context's branch
 * scope, or undefined when the actor sees all branches.
 */
export function branchFilter(ctx: TenantContext, branchIdColumn: AnyPgColumn): SQL | undefined {
  if (ctx.branchScope.kind === "all") return undefined;
  const ids = [...ctx.branchScope.branchIds];
  return ids.length === 0 ? sql`false` : inArray(branchIdColumn, ids);
}
