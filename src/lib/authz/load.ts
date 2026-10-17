import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { rolePermissions, roles, userBranchAccess, userRoles, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { isPermission, type Permission } from "@/lib/permissions/catalog";
import {
  createPlatformContext,
  createTenantContext,
  type PlatformContext,
  type TenantContext,
} from "@/lib/tenant-context";

/** Everything the server knows about what the signed-in user may do. */
export type Access = {
  user: SessionUser;
  permissions: ReadonlySet<Permission>;
  /** Set for school users. */
  tenant: TenantContext | null;
  /** Set for platform users (no school). */
  platform: PlatformContext | null;
};

/**
 * Build the access context for a validated session user from the database.
 * Only roles of the user's own school (or platform roles for platform users)
 * count, so a mis-assigned role from another school grants nothing.
 */
export async function loadAccessForUser(user: SessionUser): Promise<Access> {
  const db = getDb();
  const roleScope = user.tenantId ? eq(roles.tenantId, user.tenantId) : isNull(roles.tenantId);

  const [permissionRows, [scopeRow], branchRows] = await Promise.all([
    db
      .selectDistinct({ key: rolePermissions.permissionKey })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(and(eq(userRoles.userId, user.id), roleScope)),
    db.select({ allBranches: users.allBranches }).from(users).where(eq(users.id, user.id)),
    user.tenantId
      ? db
          .select({ branchId: userBranchAccess.branchId })
          .from(userBranchAccess)
          .where(
            and(eq(userBranchAccess.userId, user.id), eq(userBranchAccess.tenantId, user.tenantId)),
          )
      : Promise.resolve([]),
  ]);

  const keys = permissionRows.map((row) => row.key).filter(isPermission);

  if (user.tenantId) {
    const tenant = createTenantContext({
      tenantId: user.tenantId,
      branchScope: scopeRow?.allBranches ? "all" : branchRows.map((row) => row.branchId),
      permissions: keys,
      actorUserId: user.id,
    });
    return { user, permissions: tenant.permissions, tenant, platform: null };
  }
  const platform = createPlatformContext({ permissions: keys, actorUserId: user.id });
  return { user, permissions: platform.permissions, tenant: null, platform };
}
