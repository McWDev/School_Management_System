import "server-only";
import { and, count, desc, eq, ilike, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { academicYears, type AcademicYear } from "@/db/schema";
import { hasMarks } from "@/features/exams/repository";
import { recordAudit } from "@/lib/audit";
import { ConflictError, InvalidStateError, isUniqueViolation, NotFoundError } from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import { countEnrollments } from "@/features/students/repository";
import { academicYearInputSchema, academicYearListFilterSchema } from "./schemas";

/*
 * Academic (student learning) years of the current school: a name and a status
 * (Upcoming / Current / Closed). At most one year is Current: making a year
 * Current closes the previous Current year in the same transaction.
 * Reading needs academic_years.read; changes need academic_years.manage and
 * access to all branches. Every query is limited to ctx.tenantId and audited.
 */

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCanManage(ctx: TenantContext) {
  assertPermission(ctx, "academic_years.manage");
  assertAllBranches(ctx);
}

const duplicateName = () =>
  new ConflictError("An academic year with this name already exists.", {
    name: ["An academic year with this name already exists."],
  });

function translateError(error: unknown): never {
  if (isUniqueViolation(error, "academic_years_tenant_name_unique")) throw duplicateName();
  if (isUniqueViolation(error, "academic_years_one_current")) {
    throw new ConflictError("Another academic year was made Current at the same time. Try again.");
  }
  throw error;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Close the school's Current year (except `keepId`) so another can become Current. */
async function closeCurrentYear(tx: Transaction, ctx: TenantContext, keepId?: string) {
  const closed = await tx
    .update(academicYears)
    .set({ status: "closed" })
    .where(
      and(
        eq(academicYears.tenantId, ctx.tenantId),
        eq(academicYears.status, "current"),
        keepId ? ne(academicYears.id, keepId) : undefined,
      ),
    )
    .returning();
  for (const year of closed) {
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "academic_year.updated",
        entityType: "academic_year",
        entityId: year.id,
        before: { ...year, status: "current" },
        after: year,
      },
      tx,
    );
  }
}

/** Current first, then Upcoming, then Closed; newest names first within each. */
const statusOrder = sql`case ${academicYears.status} when 'current' then 0 when 'upcoming' then 1 else 2 end`;

export async function listAcademicYears(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<AcademicYear>> {
  assertPermission(ctx, "academic_years.read");
  const { status, search } = academicYearListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);

  const conditions: (SQL | undefined)[] = [
    eq(academicYears.tenantId, ctx.tenantId),
    status ? eq(academicYears.status, status) : undefined,
    search ? ilike(academicYears.name, `%${escapeLike(search)}%`) : undefined,
  ];
  const where = and(...conditions);
  const db = getDb();
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(academicYears)
      .where(where)
      .orderBy(statusOrder, desc(academicYears.name))
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(academicYears).where(where),
  ]);
  return toPage(items, total, pageInput);
}

/** The school's Current academic year, if one is set. */
export async function getCurrentAcademicYear(ctx: TenantContext): Promise<AcademicYear | null> {
  assertPermission(ctx, "academic_years.read");
  const [year] = await getDb()
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.status, "current")))
    .limit(1);
  return year ?? null;
}

export async function createAcademicYear(
  ctx: TenantContext,
  input: unknown,
): Promise<AcademicYear> {
  assertCanManage(ctx);
  const data = parseInput(academicYearInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      if (data.status === "current") await closeCurrentYear(tx, ctx);
      const [created] = await tx
        .insert(academicYears)
        .values({ ...data, tenantId: ctx.tenantId })
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "academic_year.created",
          entityType: "academic_year",
          entityId: created.id,
          after: created,
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    translateError(error);
  }
}

export async function updateAcademicYear(
  ctx: TenantContext,
  yearId: string,
  input: unknown,
): Promise<AcademicYear> {
  assertCanManage(ctx);
  const id = parseId(yearId);
  const data = parseInput(academicYearInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(academicYears)
        .where(and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.id, id)))
        .for("update");
      if (!before) throw new NotFoundError();
      if (data.status === "current") await closeCurrentYear(tx, ctx, id);
      const [updated] = await tx
        .update(academicYears)
        .set(data)
        .where(and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.id, id)))
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "academic_year.updated",
          entityType: "academic_year",
          entityId: id,
          before,
          after: updated,
        },
        tx,
      );
      return updated;
    });
  } catch (error) {
    translateError(error);
  }
}

/** Make a year the Current one (the previous Current year becomes Closed). */
export async function makeAcademicYearCurrent(
  ctx: TenantContext,
  yearId: string,
): Promise<AcademicYear> {
  assertCanManage(ctx);
  const id = parseId(yearId);
  const [year] = await getDb()
    .select({ name: academicYears.name })
    .from(academicYears)
    .where(and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.id, id)));
  if (!year) throw new NotFoundError();
  return updateAcademicYear(ctx, id, { name: year.name, status: "current" });
}

/**
 * Permanently delete an academic year without students (confirmed in the UI).
 * The audit log keeps a copy.
 */
export async function deleteAcademicYear(ctx: TenantContext, yearId: string): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(yearId);
  await getDb().transaction(async (tx) => {
    if (await hasMarks(tx, ctx.tenantId, { academicYearId: id })) {
      throw new InvalidStateError("This academic year has exam marks. Set it to Closed instead.");
    }
    const placed = await countEnrollments(tx, ctx.tenantId, { academicYearId: id });
    if (placed > 0) {
      throw new InvalidStateError(
        `This academic year has ${placed} ${placed === 1 ? "student" : "students"}. Set it to Closed instead.`,
      );
    }
    const [removed] = await tx
      .delete(academicYears)
      .where(and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.id, id)))
      .returning();
    if (!removed) throw new NotFoundError();
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "academic_year.deleted",
        entityType: "academic_year",
        entityId: id,
        before: removed,
      },
      tx,
    );
  });
}
