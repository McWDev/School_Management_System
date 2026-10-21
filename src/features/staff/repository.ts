import "server-only";
import { and, asc, count, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  sessions,
  staff,
  staffPhotos,
  subjects,
  users,
  workTypes,
  type Staff,
  type WorkType,
} from "@/db/schema";
import { hasPayrollRecords } from "@/features/payroll/repository";
import { hashPassword, newPasswordSchema } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { checkImage } from "@/lib/images";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  staffInputSchema,
  staffListFilterSchema,
  usernameSchema,
  workTypeInputSchema,
} from "./schemas";

/*
 * School staff and their work types. Staff are school-wide (not per branch):
 * reading needs staff.read, changes need staff.manage and access to all
 * branches. Every query is limited to ctx.tenantId; changes are audited.
 */

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCanManage(ctx: TenantContext) {
  assertPermission(ctx, "staff.manage");
  assertAllBranches(ctx);
}

const duplicateWorkType = () =>
  new ConflictError("A work type with this name already exists.", {
    name: ["A work type with this name already exists."],
  });

// ------------------------------------------------------------- work types

export type WorkTypeSummary = Pick<WorkType, "id" | "name"> & { staffCount: number };

export async function listWorkTypes(ctx: TenantContext): Promise<WorkTypeSummary[]> {
  assertPermission(ctx, "staff.read");
  const db = getDb();
  const [types, counts] = await Promise.all([
    db
      .select({ id: workTypes.id, name: workTypes.name })
      .from(workTypes)
      .where(eq(workTypes.tenantId, ctx.tenantId))
      .orderBy(asc(workTypes.name)),
    db
      .select({ workTypeId: staff.workTypeId, total: count() })
      .from(staff)
      .where(eq(staff.tenantId, ctx.tenantId))
      .groupBy(staff.workTypeId),
  ]);
  return types.map((t) => ({
    ...t,
    staffCount: counts.find((c) => c.workTypeId === t.id)?.total ?? 0,
  }));
}

export async function createWorkType(ctx: TenantContext, input: unknown): Promise<WorkType> {
  assertCanManage(ctx);
  const { name } = parseInput(workTypeInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(workTypes)
        .values({ tenantId: ctx.tenantId, name })
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "work_type.created",
          entityType: "work_type",
          entityId: created.id,
          after: { name },
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "work_types_tenant_name_unique")) throw duplicateWorkType();
    throw error;
  }
}

export async function renameWorkType(
  ctx: TenantContext,
  workTypeId: string,
  input: unknown,
): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(workTypeId);
  const { name } = parseInput(workTypeInputSchema, input);
  try {
    await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(workTypes)
        .where(and(eq(workTypes.tenantId, ctx.tenantId), eq(workTypes.id, id)));
      if (!before) throw new NotFoundError();
      await tx
        .update(workTypes)
        .set({ name })
        .where(and(eq(workTypes.tenantId, ctx.tenantId), eq(workTypes.id, id)));
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "work_type.renamed",
          entityType: "work_type",
          entityId: id,
          before: { name: before.name },
          after: { name },
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error, "work_types_tenant_name_unique")) throw duplicateWorkType();
    throw error;
  }
}

/** Remove a work type that no staff member uses. */
export async function deleteWorkType(ctx: TenantContext, workTypeId: string): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(workTypeId);
  await getDb().transaction(async (tx) => {
    const [type] = await tx
      .select()
      .from(workTypes)
      .where(and(eq(workTypes.tenantId, ctx.tenantId), eq(workTypes.id, id)))
      .for("update");
    if (!type) throw new NotFoundError();
    const [{ total }] = await tx
      .select({ total: count() })
      .from(staff)
      .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.workTypeId, id)));
    if (total > 0) {
      throw new InvalidStateError(
        `${type.name} is used by ${total} staff ${total === 1 ? "member" : "members"}. Change their work type first.`,
      );
    }
    await tx
      .delete(workTypes)
      .where(and(eq(workTypes.tenantId, ctx.tenantId), eq(workTypes.id, id)));
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "work_type.deleted",
        entityType: "work_type",
        entityId: id,
        before: { name: type.name },
      },
      tx,
    );
  });
}

// ------------------------------------------------------------------ staff

export type StaffSummary = Staff & {
  workTypeName: string;
  photoVersion: number | null;
  /** Login username, when the staff member has login access. */
  username: string | null;
};

export async function listStaff(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<StaffSummary>> {
  assertPermission(ctx, "staff.read");
  const { status, workTypeId, search } = staffListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);

  const conditions: (SQL | undefined)[] = [
    eq(staff.tenantId, ctx.tenantId),
    status ? eq(staff.status, status) : undefined,
    workTypeId ? eq(staff.workTypeId, workTypeId) : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(ilike(staff.fullName, pattern), ilike(staff.phone, pattern), ilike(staff.email, pattern)),
    );
  }
  const where = and(...conditions);
  const db = getDb();

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        staff,
        workTypeName: workTypes.name,
        photoUpdatedAt: staffPhotos.updatedAt,
        username: users.username,
      })
      .from(staff)
      .innerJoin(
        workTypes,
        and(eq(workTypes.id, staff.workTypeId), eq(workTypes.tenantId, staff.tenantId)),
      )
      .leftJoin(staffPhotos, eq(staffPhotos.staffId, staff.id))
      .leftJoin(users, and(eq(users.id, staff.userId), eq(users.tenantId, staff.tenantId)))
      .where(where)
      .orderBy(asc(staff.fullName), staff.id)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(staff).where(where),
  ]);
  const items = rows.map((row) => ({
    ...row.staff,
    workTypeName: row.workTypeName,
    photoVersion: row.photoUpdatedAt ? row.photoUpdatedAt.getTime() : null,
    username: row.username,
  }));
  return toPage(items, total, pageInput);
}

async function assertWorkTypeInSchool(ctx: TenantContext, workTypeId: string) {
  const [type] = await getDb()
    .select({ id: workTypes.id })
    .from(workTypes)
    .where(and(eq(workTypes.tenantId, ctx.tenantId), eq(workTypes.id, workTypeId)));
  if (!type) throw new ValidationError(undefined, { workTypeId: ["Choose a work type."] });
}

function checkPhoto(photo: Uint8Array | null | undefined) {
  if (!photo || photo.length === 0) return null;
  const result = checkImage(photo, "photo");
  if (!result.ok) throw new ValidationError(result.message, { photo: [result.message] });
  return { type: result.type, data: Buffer.from(photo) };
}

type Executor = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function savePhoto(
  tx: Executor,
  tenantId: string,
  staffId: string,
  photo: { type: string; data: Buffer },
) {
  await tx
    .insert(staffPhotos)
    .values({
      staffId,
      tenantId,
      contentType: photo.type,
      byteSize: photo.data.length,
      data: photo.data,
    })
    .onConflictDoUpdate({
      target: staffPhotos.staffId,
      set: {
        contentType: photo.type,
        byteSize: photo.data.length,
        data: photo.data,
        updatedAt: new Date(),
      },
    });
}

/**
 * Login access requested in the staff form. On create both fields are needed;
 * on edit an empty password keeps the current one.
 */
export type StaffLoginInput = { username?: string; password?: string };

type CheckedLogin = { username: string; passwordHash: string | null };

const duplicateUsername = () =>
  new ConflictError("This username is already taken.", {
    username: ["This username is already taken."],
  });

/** Validate requested login access; returns null when none was asked for. */
async function checkLogin(
  login: StaffLoginInput | undefined,
  options: { passwordRequired: boolean },
): Promise<CheckedLogin | null> {
  const username = login?.username?.trim() ?? "";
  const password = login?.password ?? "";
  if (!username && !password) return null;

  const fieldErrors: Record<string, string[]> = {};
  const parsedUsername = usernameSchema.safeParse(username);
  if (!username) fieldErrors.username = ["Enter a username."];
  else if (!parsedUsername.success) {
    fieldErrors.username = parsedUsername.error.issues.map((i) => i.message);
  }
  if (password || options.passwordRequired) {
    const parsedPassword = newPasswordSchema.safeParse(password);
    if (!password) fieldErrors.password = ["Enter a password."];
    else if (!parsedPassword.success) {
      fieldErrors.password = parsedPassword.error.issues.map((i) => i.message);
    }
  }
  if (Object.keys(fieldErrors).length) throw new ValidationError(undefined, fieldErrors);

  return {
    username: parsedUsername.data!,
    passwordHash: password ? await hashPassword(password) : null,
  };
}

/** Only Active staff may sign in; Inactive and Left are blocked and signed out. */
function accountStatusFor(status: Staff["status"]) {
  return status === "active" ? ("active" as const) : ("disabled" as const);
}

async function revokeSessions(tx: Executor, userId: string, reason: string) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Add a staff member, optionally with a photo and login access. */
export async function createStaff(
  ctx: TenantContext,
  input: unknown,
  photo?: Uint8Array | null,
  login?: StaffLoginInput,
): Promise<Staff> {
  assertCanManage(ctx);
  const data = parseInput(staffInputSchema, input);
  const checkedPhoto = checkPhoto(photo);
  const checkedLogin = await checkLogin(login, { passwordRequired: true });
  await assertWorkTypeInSchool(ctx, data.workTypeId);

  try {
    return await getDb().transaction(async (tx) => {
      let userId: string | null = null;
      if (checkedLogin) {
        const [user] = await tx
          .insert(users)
          .values({
            tenantId: ctx.tenantId,
            username: checkedLogin.username,
            fullName: data.fullName,
            passwordHash: checkedLogin.passwordHash!,
            status: accountStatusFor(data.status),
            passwordChangedAt: new Date(),
          })
          .returning({ id: users.id });
        userId = user.id;
      }
      const [created] = await tx
        .insert(staff)
        .values({ ...data, tenantId: ctx.tenantId, userId })
        .returning();
      if (checkedPhoto) await savePhoto(tx, ctx.tenantId, created.id, checkedPhoto);
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "staff.created",
          entityType: "staff",
          entityId: created.id,
          after: {
            ...created,
            photo: Boolean(checkedPhoto),
            login: checkedLogin ? checkedLogin.username : null,
          },
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_username_unique")) throw duplicateUsername();
    throw error;
  }
}

/**
 * Edit a staff member. `photo` replaces the photo; `removePhoto` deletes it.
 * `login` gives login access (username + password) or changes the username or
 * password of an existing login. The account follows the staff status:
 * Inactive or Left disables it and signs the person out everywhere.
 */
export async function updateStaff(
  ctx: TenantContext,
  staffId: string,
  input: unknown,
  options: { photo?: Uint8Array | null; removePhoto?: boolean; login?: StaffLoginInput } = {},
): Promise<Staff> {
  assertCanManage(ctx);
  const id = parseId(staffId);
  const data = parseInput(staffInputSchema, input);
  const checkedPhoto = checkPhoto(options.photo);
  await assertWorkTypeInSchool(ctx, data.workTypeId);

  const [existing] = await getDb()
    .select({ userId: staff.userId })
    .from(staff)
    .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, id)));
  if (!existing) throw new NotFoundError();
  // A new login needs a password; an existing one keeps it unless a new one is given.
  const checkedLogin = await checkLogin(options.login, { passwordRequired: !existing.userId });

  try {
    return await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(staff)
        .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, id)))
        .for("update");
      if (!before) throw new NotFoundError();

      let userId = before.userId;
      const accountStatus = accountStatusFor(data.status);
      if (userId) {
        const [account] = await tx
          .select({ status: users.status, username: users.username })
          .from(users)
          .where(and(eq(users.id, userId), eq(users.tenantId, ctx.tenantId)));
        await tx
          .update(users)
          .set({
            fullName: data.fullName,
            status: accountStatus,
            ...(checkedLogin ? { username: checkedLogin.username } : {}),
            ...(checkedLogin?.passwordHash
              ? { passwordHash: checkedLogin.passwordHash, passwordChangedAt: new Date() }
              : {}),
          })
          .where(and(eq(users.id, userId), eq(users.tenantId, ctx.tenantId)));
        if (accountStatus === "disabled" && account?.status === "active") {
          await revokeSessions(tx, userId, `staff_${data.status}`);
        } else if (checkedLogin?.passwordHash) {
          await revokeSessions(tx, userId, "password_changed");
        }
      } else if (checkedLogin) {
        const [user] = await tx
          .insert(users)
          .values({
            tenantId: ctx.tenantId,
            username: checkedLogin.username,
            fullName: data.fullName,
            passwordHash: checkedLogin.passwordHash!,
            status: accountStatus,
            passwordChangedAt: new Date(),
          })
          .returning({ id: users.id });
        userId = user.id;
      }

      const [updated] = await tx
        .update(staff)
        .set({ ...data, userId })
        .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, id)))
        .returning();
      if (checkedPhoto) {
        await savePhoto(tx, ctx.tenantId, id, checkedPhoto);
      } else if (options.removePhoto) {
        await tx
          .delete(staffPhotos)
          .where(and(eq(staffPhotos.tenantId, ctx.tenantId), eq(staffPhotos.staffId, id)));
      }
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "staff.updated",
          entityType: "staff",
          entityId: id,
          before,
          after: {
            ...updated,
            photo: checkedPhoto ? "replaced" : options.removePhoto ? "removed" : "unchanged",
            login: checkedLogin
              ? {
                  username: checkedLogin.username,
                  password: checkedLogin.passwordHash ? "changed" : "unchanged",
                }
              : "unchanged",
          },
        },
        tx,
      );
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_username_unique")) throw duplicateUsername();
    throw error;
  }
}

/**
 * Permanently delete a staff member (product owner, 2026-10-17): the record,
 * their photo and their login account, which signs them out everywhere.
 * The audit log keeps who deleted whom.
 */
export async function deleteStaff(ctx: TenantContext, staffId: string): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(staffId);
  await getDb().transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(staff)
      .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, id)))
      .for("update");
    if (!member) throw new NotFoundError();
    if (member.userId && member.userId === ctx.actorUserId) {
      throw new InvalidStateError("You cannot delete the staff record of your own login.");
    }
    if (await hasPayrollRecords(tx, ctx.tenantId, id)) {
      throw new InvalidStateError(
        `${member.fullName} has salary records and cannot be deleted. Set the status to Left instead.`,
      );
    }

    // Subjects they teach are left without a teacher.
    await tx
      .update(subjects)
      .set({ teacherStaffId: null })
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.teacherStaffId, id)));
    // The photo goes with the record (foreign key cascade).
    await tx.delete(staff).where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, id)));
    if (member.userId) {
      // Sessions, reset links and role links are removed with the account.
      await tx
        .delete(users)
        .where(and(eq(users.id, member.userId), eq(users.tenantId, ctx.tenantId)));
    }
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "staff.deleted",
        entityType: "staff",
        entityId: id,
        before: { ...member, hadLogin: Boolean(member.userId) },
      },
      tx,
    );
  });
}

/** A staff photo of the actor's own school (needs staff.read). */
export async function getStaffPhoto(
  ctx: TenantContext,
  staffId: string,
): Promise<{ contentType: string; data: Buffer; updatedAt: Date } | null> {
  assertPermission(ctx, "staff.read");
  const id = uuidSchema.safeParse(staffId);
  if (!id.success) return null;
  const [row] = await getDb()
    .select({
      contentType: staffPhotos.contentType,
      data: staffPhotos.data,
      updatedAt: staffPhotos.updatedAt,
    })
    .from(staffPhotos)
    .where(and(eq(staffPhotos.tenantId, ctx.tenantId), eq(staffPhotos.staffId, id.data)));
  return row ?? null;
}
