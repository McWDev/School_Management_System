import "server-only";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  isPermission,
  PLATFORM_PERMISSIONS,
  TENANT_PERMISSIONS,
  type Permission,
} from "@/lib/permissions/catalog";

/*
 * Server-side access context (07-Authentication-Roles-Security.md §2, §5).
 *
 * Every tenant-owned read and write takes a TenantContext: the school, the
 * branch scope and the actor's permissions. It is built on the server from the
 * authenticated session (src/lib/authz) and never from browser input. Platform
 * operations take a PlatformContext, so the two cannot be confused.
 */

/** Which branches the actor may see inside their tenant. */
export type BranchScope =
  { readonly kind: "all" } | { readonly kind: "branches"; readonly branchIds: ReadonlySet<string> };

export type TenantContext = {
  readonly kind: "tenant";
  readonly tenantId: string;
  readonly branchScope: BranchScope;
  readonly permissions: ReadonlySet<Permission>;
  /** Acting user, for audit records. Undefined only for system jobs. */
  readonly actorUserId?: string;
};

export type PlatformContext = {
  readonly kind: "platform";
  readonly permissions: ReadonlySet<Permission>;
  readonly actorUserId?: string;
};

const uuid = z.uuid();

function toPermissionSet(
  input: readonly string[] | "all",
  allowed: readonly Permission[],
): ReadonlySet<Permission> {
  if (input === "all") return new Set(allowed);
  return new Set(input.filter((p): p is Permission => isPermission(p) && allowed.includes(p)));
}

export function createTenantContext(input: {
  tenantId: string;
  branchScope: "all" | readonly string[];
  /** Permission keys, or "all" for every school permission (seed/system jobs, tests). */
  permissions: readonly string[] | "all";
  actorUserId?: string;
}): TenantContext {
  const tenantId = uuid.parse(input.tenantId);
  const branchScope: BranchScope =
    input.branchScope === "all"
      ? { kind: "all" }
      : { kind: "branches", branchIds: new Set(input.branchScope.map((id) => uuid.parse(id))) };
  return Object.freeze({
    kind: "tenant",
    tenantId,
    branchScope,
    permissions: toPermissionSet(input.permissions, TENANT_PERMISSIONS),
    actorUserId: input.actorUserId,
  });
}

export function createPlatformContext(input: {
  permissions: readonly string[] | "all";
  actorUserId?: string;
}): PlatformContext {
  return Object.freeze({
    kind: "platform",
    permissions: toPermissionSet(input.permissions, PLATFORM_PERMISSIONS),
    actorUserId: input.actorUserId,
  });
}

export function can(ctx: TenantContext | PlatformContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** Throw Forbidden unless the actor holds `permission`. */
export function assertPermission(
  ctx: TenantContext | PlatformContext,
  permission: Permission,
): void {
  if (!ctx.permissions.has(permission)) throw new ForbiddenError();
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
