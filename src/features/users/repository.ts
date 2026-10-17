import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  branches,
  rolePermissions,
  roles,
  sessions,
  tenants,
  userBranchAccess,
  userRoles,
  users,
  type User,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { ACCOUNT_SETUP_TTL_MS, PASSWORD_RESET_TTL_MS } from "@/lib/auth/config";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/service";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import {
  assertAllBranches,
  assertPermission,
  type PlatformContext,
  type TenantContext,
} from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  createSchoolUserSchema,
  schoolAdminSchema,
  updateSchoolUserSchema,
  userListFilterSchema,
} from "./schemas";

/*
 * User management inside a school (users.manage, all-branch actors only).
 * New users get a one-time setup link instead of a password, because email
 * delivery is not configured. Every change is audited.
 */

export type SchoolUserSummary = Pick<
  User,
  "id" | "email" | "fullName" | "status" | "allBranches" | "lastLoginAt" | "createdAt"
> & {
  roles: { id: string; name: string }[];
  branches: { id: string; name: string }[];
};

export type SetupLink = { token: string; expiresAt: Date };

function assertCanManageUsers(ctx: TenantContext) {
  assertPermission(ctx, "users.manage");
  assertAllBranches(ctx);
}

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/** An unguessable hash nobody knows the password for: the user sets one via the setup link. */
async function unusablePasswordHash() {
  return hashPassword(randomBytes(32).toString("base64url"));
}

/** Throw unless every role and branch id belongs to this school (branches must be active). */
async function validateAccessTargets(
  tenantId: string,
  roleIds: string[],
  branchIds: string[],
): Promise<{ roleNames: string[]; branchNames: string[] }> {
  const db = getDb();
  const [roleRows, branchRows] = await Promise.all([
    db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(and(eq(roles.tenantId, tenantId), inArray(roles.id, roleIds))),
    branchIds.length
      ? db
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(
            and(
              eq(branches.tenantId, tenantId),
              eq(branches.status, "active"),
              inArray(branches.id, branchIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  if (roleRows.length !== new Set(roleIds).size) {
    throw new ValidationError(undefined, { roleIds: ["Choose roles from this school."] });
  }
  if (branchRows.length !== new Set(branchIds).size) {
    throw new ValidationError(undefined, { branchIds: ["Choose active branches of this school."] });
  }
  return { roleNames: roleRows.map((r) => r.name), branchNames: branchRows.map((b) => b.name) };
}

type Executor = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function writeAccess(
  tx: Executor,
  tenantId: string,
  userId: string,
  roleIds: string[],
  branchIds: string[],
) {
  await tx.delete(userRoles).where(eq(userRoles.userId, userId));
  await tx.delete(userBranchAccess).where(eq(userBranchAccess.userId, userId));
  await tx.insert(userRoles).values([...new Set(roleIds)].map((roleId) => ({ userId, roleId })));
  if (branchIds.length) {
    await tx
      .insert(userBranchAccess)
      .values([...new Set(branchIds)].map((branchId) => ({ tenantId, userId, branchId })));
  }
}

async function findSchoolUser(ctx: TenantContext, userId: string): Promise<User> {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, parseId(userId))));
  if (!user) throw new NotFoundError();
  return user;
}

const duplicateEmail = () =>
  new ConflictError("A user with this email already exists.", {
    email: ["A user with this email already exists."],
  });

// ------------------------------------------------------------------ reads

export async function listSchoolUsers(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<SchoolUserSummary>> {
  assertCanManageUsers(ctx);
  const { status, search } = userListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);

  const conditions: (SQL | undefined)[] = [
    eq(users.tenantId, ctx.tenantId),
    status ? eq(users.status, status) : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(or(ilike(users.fullName, pattern), ilike(users.email, pattern)));
  }
  const where = and(...conditions);
  const db = getDb();

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        status: users.status,
        allBranches: users.allBranches,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(asc(users.fullName), users.id)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(users).where(where),
  ]);

  const ids = rows.map((r) => r.id);
  const [roleRows, branchRows] = ids.length
    ? await Promise.all([
        db
          .select({ userId: userRoles.userId, id: roles.id, name: roles.name })
          .from(userRoles)
          .innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.tenantId, ctx.tenantId)))
          .where(inArray(userRoles.userId, ids))
          .orderBy(asc(roles.name)),
        db
          .select({ userId: userBranchAccess.userId, id: branches.id, name: branches.name })
          .from(userBranchAccess)
          .innerJoin(branches, eq(userBranchAccess.branchId, branches.id))
          .where(
            and(inArray(userBranchAccess.userId, ids), eq(userBranchAccess.tenantId, ctx.tenantId)),
          )
          .orderBy(asc(branches.name)),
      ])
    : [[], []];

  const items = rows.map((row) => ({
    ...row,
    roles: roleRows.filter((r) => r.userId === row.id).map(({ id, name }) => ({ id, name })),
    branches: branchRows.filter((b) => b.userId === row.id).map(({ id, name }) => ({ id, name })),
  }));
  return toPage(items, total, pageInput);
}

export async function getSchoolUser(
  ctx: TenantContext,
  userId: string,
): Promise<SchoolUserSummary & { roleIds: string[]; branchIds: string[] }> {
  assertCanManageUsers(ctx);
  const user = await findSchoolUser(ctx, userId);
  const db = getDb();
  const [roleRows, branchRows] = await Promise.all([
    db
      .select({ id: roles.id, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.tenantId, ctx.tenantId)))
      .where(eq(userRoles.userId, user.id)),
    db
      .select({ id: branches.id, name: branches.name })
      .from(userBranchAccess)
      .innerJoin(branches, eq(userBranchAccess.branchId, branches.id))
      .where(eq(userBranchAccess.userId, user.id)),
  ]);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    allBranches: user.allBranches,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles: roleRows,
    branches: branchRows,
    roleIds: roleRows.map((r) => r.id),
    branchIds: branchRows.map((b) => b.id),
  };
}

// ----------------------------------------------------------------- writes

/** Create a school user and return their one-time setup link token. */
export async function createSchoolUser(
  ctx: TenantContext,
  input: unknown,
): Promise<{ user: User; setup: SetupLink }> {
  assertCanManageUsers(ctx);
  const data = parseInput(createSchoolUserSchema, input);
  const branchIds = data.allBranches ? [] : data.branchIds;
  const names = await validateAccessTargets(ctx.tenantId, data.roleIds, branchIds);
  const passwordHash = await unusablePasswordHash();

  let user: User;
  try {
    user = await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          tenantId: ctx.tenantId,
          email: data.email,
          fullName: data.fullName,
          passwordHash,
          allBranches: data.allBranches,
        })
        .returning();
      await writeAccess(tx, ctx.tenantId, created.id, data.roleIds, branchIds);
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "user.created",
          entityType: "user",
          entityId: created.id,
          after: {
            email: created.email,
            fullName: created.fullName,
            roles: names.roleNames,
            allBranches: data.allBranches,
            branches: names.branchNames,
          },
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique")) throw duplicateEmail();
    throw error;
  }
  const setup = await createPasswordResetToken(user.id, ACCOUNT_SETUP_TTL_MS);
  return { user, setup };
}

/** Change a user's name, roles and branch access. */
export async function updateSchoolUser(
  ctx: TenantContext,
  userId: string,
  input: unknown,
): Promise<void> {
  assertCanManageUsers(ctx);
  const before = await getSchoolUser(ctx, userId);
  const data = parseInput(updateSchoolUserSchema, input);
  const branchIds = data.allBranches ? [] : data.branchIds;
  const names = await validateAccessTargets(ctx.tenantId, data.roleIds, branchIds);

  // Never let an admin remove their own ability to manage users.
  if (before.id === ctx.actorUserId) {
    if (!data.allBranches) {
      throw new InvalidStateError("You cannot remove your own access to all branches.");
    }
    const [{ total }] = await getDb()
      .select({ total: count() })
      .from(rolePermissions)
      .where(
        and(
          inArray(rolePermissions.roleId, data.roleIds),
          eq(rolePermissions.permissionKey, "users.manage"),
        ),
      );
    if (total === 0) {
      throw new InvalidStateError("You cannot remove your own permission to manage users.");
    }
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ fullName: data.fullName, allBranches: data.allBranches })
      .where(and(eq(users.id, before.id), eq(users.tenantId, ctx.tenantId)));
    await writeAccess(tx, ctx.tenantId, before.id, data.roleIds, branchIds);
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "user.access_changed",
        entityType: "user",
        entityId: before.id,
        before: {
          fullName: before.fullName,
          roles: before.roles.map((r) => r.name),
          allBranches: before.allBranches,
          branches: before.branches.map((b) => b.name),
        },
        after: {
          fullName: data.fullName,
          roles: names.roleNames,
          allBranches: data.allBranches,
          branches: names.branchNames,
        },
      },
      tx,
    );
  });
}

/** Disable (revoking every session) or re-enable a user. */
export async function setSchoolUserStatus(
  ctx: TenantContext,
  userId: string,
  status: User["status"],
): Promise<void> {
  assertCanManageUsers(ctx);
  const user = await findSchoolUser(ctx, userId);
  if (user.id === ctx.actorUserId)
    throw new InvalidStateError("You cannot disable your own account.");
  if (user.status === status) throw new InvalidStateError(`This user is already ${status}.`);

  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ status }).where(eq(users.id, user.id));
    if (status === "disabled") {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "user_disabled" })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    }
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: status === "disabled" ? "user.disabled" : "user.enabled",
        entityType: "user",
        entityId: user.id,
        before: { status: user.status },
        after: { status },
      },
      tx,
    );
  });
}

/** One-time password reset link for a user of this school (30 minutes). */
export async function createSchoolUserResetLink(
  ctx: TenantContext,
  userId: string,
): Promise<SetupLink> {
  assertCanManageUsers(ctx);
  const user = await findSchoolUser(ctx, userId);
  if (user.status !== "active") {
    throw new InvalidStateError("Enable this user before creating a reset link.");
  }
  const link = await createPasswordResetToken(user.id, PASSWORD_RESET_TTL_MS);
  await recordAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "user.reset_link_created",
    entityType: "user",
    entityId: user.id,
  });
  return link;
}

// --------------------------------------------------------------- platform

/** Create the first School Admin of a school (platform onboarding). */
export async function createSchoolAdmin(
  ctx: PlatformContext,
  schoolId: string,
  input: unknown,
): Promise<{ user: User; setup: SetupLink }> {
  if (ctx?.kind !== "platform") throw new NotFoundError();
  if (!ctx.permissions.has("schools.create") && !ctx.permissions.has("schools.update")) {
    throw new ForbiddenError();
  }
  const tenantId = parseId(schoolId);
  const data = parseInput(schoolAdminSchema, input);
  const db = getDb();
  const [[school], [adminRole]] = await Promise.all([
    db
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, tenantId)),
    db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.tenantId, tenantId), eq(roles.presetKey, "school_admin"))),
  ]);
  if (!school) throw new NotFoundError();
  if (school.status === "archived") throw new InvalidStateError("This school is archived.");
  if (!adminRole) throw new InvalidStateError("This school has no School Admin role.");

  const passwordHash = await unusablePasswordHash();
  let user: User;
  try {
    user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          tenantId,
          email: data.email,
          fullName: data.fullName,
          passwordHash,
          allBranches: true,
        })
        .returning();
      await tx.insert(userRoles).values({ userId: created.id, roleId: adminRole.id });
      await recordAudit(
        {
          tenantId,
          actorUserId: ctx.actorUserId,
          action: "user.created",
          entityType: "user",
          entityId: created.id,
          after: {
            email: created.email,
            fullName: created.fullName,
            roles: ["School Admin"],
            allBranches: true,
          },
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique")) throw duplicateEmail();
    throw error;
  }
  const setup = await createPasswordResetToken(user.id, ACCOUNT_SETUP_TTL_MS);
  return { user, setup };
}
