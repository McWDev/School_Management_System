import "server-only";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { staff, staffPhotos, workTypes, type Staff, type WorkType } from "@/db/schema";
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
import { staffInputSchema, staffListFilterSchema, workTypeInputSchema } from "./schemas";

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

export type StaffSummary = Staff & { workTypeName: string; photoVersion: number | null };

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
      .select({ staff, workTypeName: workTypes.name, photoUpdatedAt: staffPhotos.updatedAt })
      .from(staff)
      .innerJoin(
        workTypes,
        and(eq(workTypes.id, staff.workTypeId), eq(workTypes.tenantId, staff.tenantId)),
      )
      .leftJoin(staffPhotos, eq(staffPhotos.staffId, staff.id))
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

/** Add a staff member, optionally with a photo (PNG/JPEG/WebP, ≤ 1 MB). */
export async function createStaff(
  ctx: TenantContext,
  input: unknown,
  photo?: Uint8Array | null,
): Promise<Staff> {
  assertCanManage(ctx);
  const data = parseInput(staffInputSchema, input);
  const checkedPhoto = checkPhoto(photo);
  await assertWorkTypeInSchool(ctx, data.workTypeId);

  return getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(staff)
      .values({ ...data, tenantId: ctx.tenantId })
      .returning();
    if (checkedPhoto) await savePhoto(tx, ctx.tenantId, created.id, checkedPhoto);
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "staff.created",
        entityType: "staff",
        entityId: created.id,
        after: { ...created, photo: Boolean(checkedPhoto) },
      },
      tx,
    );
    return created;
  });
}

/** Edit a staff member. `photo` replaces the photo; `removePhoto` deletes it. */
export async function updateStaff(
  ctx: TenantContext,
  staffId: string,
  input: unknown,
  options: { photo?: Uint8Array | null; removePhoto?: boolean } = {},
): Promise<Staff> {
  assertCanManage(ctx);
  const id = parseId(staffId);
  const data = parseInput(staffInputSchema, input);
  const checkedPhoto = checkPhoto(options.photo);
  await assertWorkTypeInSchool(ctx, data.workTypeId);

  return getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(staff)
      .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, id)))
      .for("update");
    if (!before) throw new NotFoundError();
    const [updated] = await tx
      .update(staff)
      .set(data)
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
        },
      },
      tx,
    );
    return updated;
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
