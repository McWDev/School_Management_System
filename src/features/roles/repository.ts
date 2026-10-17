import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { rolePermissions, roles, userRoles, type Role } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
} from "@/lib/errors";
import { TENANT_PERMISSIONS, type Permission } from "@/lib/permissions/catalog";
import { assertAllBranches, assertPermission, can, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";

/*
 * School roles (roles.manage). Preset roles come from
 * src/lib/permissions/presets.ts; locked presets cannot be edited.
 */

export type RoleSummary = Pick<Role, "id" | "name" | "description" | "presetKey" | "locked"> & {
  permissions: Permission[];
  userCount: number;
};

const roleInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name.").max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullish(),
  permissions: z
    .array(z.enum(TENANT_PERMISSIONS as [Permission, ...Permission[]]))
    .min(1, "Choose at least one permission."),
});

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/** Roles of the school with their permissions. Needed to manage roles or assign them to users. */
export async function listRoles(ctx: TenantContext): Promise<RoleSummary[]> {
  if (!can(ctx, "roles.manage") && !can(ctx, "users.manage")) throw new ForbiddenError();
  const db = getDb();
  const roleRows = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      presetKey: roles.presetKey,
      locked: roles.locked,
    })
    .from(roles)
    .where(eq(roles.tenantId, ctx.tenantId))
    .orderBy(asc(roles.name));
  const ids = roleRows.map((r) => r.id);
  if (!ids.length) return [];

  const [permissionRows, countRows] = await Promise.all([
    db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, ids)),
    db
      .select({ roleId: userRoles.roleId, total: count() })
      .from(userRoles)
      .where(inArray(userRoles.roleId, ids))
      .groupBy(userRoles.roleId),
  ]);
  return roleRows.map((role) => ({
    ...role,
    permissions: permissionRows
      .filter((p) => p.roleId === role.id)
      .map((p) => p.permissionKey as Permission)
      .sort(),
    userCount: countRows.find((c) => c.roleId === role.id)?.total ?? 0,
  }));
}

export async function createRole(ctx: TenantContext, input: unknown): Promise<Role> {
  assertPermission(ctx, "roles.manage");
  assertAllBranches(ctx);
  const data = parseInput(roleInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ tenantId: ctx.tenantId, name: data.name, description: data.description })
        .returning();
      await tx.insert(rolePermissions).values(
        [...new Set(data.permissions)].map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
        })),
      );
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "role.created",
          entityType: "role",
          entityId: role.id,
          after: { name: role.name, permissions: data.permissions },
        },
        tx,
      );
      return role;
    });
  } catch (error) {
    if (isUniqueViolation(error, "roles_tenant_name_unique")) {
      throw new ConflictError("A role with this name already exists.", {
        name: ["A role with this name already exists."],
      });
    }
    throw error;
  }
}

export async function updateRole(
  ctx: TenantContext,
  roleId: string,
  input: unknown,
): Promise<void> {
  assertPermission(ctx, "roles.manage");
  assertAllBranches(ctx);
  const id = parseId(roleId);
  const data = parseInput(roleInputSchema, input);
  const db = getDb();
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.tenantId, ctx.tenantId)));
  if (!role) throw new NotFoundError();
  if (role.locked)
    throw new InvalidStateError(`The ${role.name} role is built in and cannot be changed.`);

  const before = await db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, id));

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(roles)
        .set({ name: data.name, description: data.description })
        .where(eq(roles.id, id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await tx
        .insert(rolePermissions)
        .values(
          [...new Set(data.permissions)].map((permissionKey) => ({ roleId: id, permissionKey })),
        );
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "role.permissions_changed",
          entityType: "role",
          entityId: id,
          before: { name: role.name, permissions: before.map((b) => b.key).sort() },
          after: { name: data.name, permissions: [...data.permissions].sort() },
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error, "roles_tenant_name_unique")) {
      throw new ConflictError("A role with this name already exists.", {
        name: ["A role with this name already exists."],
      });
    }
    throw error;
  }
}
