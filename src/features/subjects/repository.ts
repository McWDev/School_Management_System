import "server-only";
import { and, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { staff, subjectNumberCounters, subjects, workTypes, type Subject } from "@/db/schema";
import { hasMarks } from "@/features/exams/repository";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  assignTeacherSchema,
  formatSubjectCode,
  subjectInputSchema,
  subjectListFilterSchema,
} from "./schemas";

/*
 * Subjects of the current school: a name and an automatic code (SUB-001). Reading needs
 * courses.read; changes need courses.manage and access to all branches.
 * Every query is limited to ctx.tenantId and every change is audited.
 */

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCanManage(ctx: TenantContext) {
  assertPermission(ctx, "courses.manage");
  assertAllBranches(ctx);
}

function translateError(error: unknown): never {
  if (isUniqueViolation(error, "subjects_tenant_name_unique")) {
    throw new ConflictError("A subject with this name already exists.", {
      name: ["A subject with this name already exists."],
    });
  }
  if (isUniqueViolation(error, "subjects_tenant_code_unique")) {
    throw new ConflictError("Another subject was added at the same time. Try again.");
  }
  throw error;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The next subject code of the school; codes are never reused. */
async function nextSubjectCode(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .insert(subjectNumberCounters)
    .values({ tenantId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: subjectNumberCounters.tenantId,
      set: { lastNumber: sql`${subjectNumberCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: subjectNumberCounters.lastNumber });
  return formatSubjectCode(row.lastNumber);
}

export type SubjectRow = Subject & { teacherName: string | null };

export async function listSubjects(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<SubjectRow>> {
  assertPermission(ctx, "courses.read");
  const { status, search } = subjectListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);
  const pattern = search ? `%${escapeLike(search)}%` : undefined;
  const conditions: (SQL | undefined)[] = [
    eq(subjects.tenantId, ctx.tenantId),
    status ? eq(subjects.status, status) : undefined,
    pattern ? or(ilike(subjects.name, pattern), ilike(subjects.code, pattern)) : undefined,
  ];
  const where = and(...conditions);
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ subject: subjects, teacherName: staff.fullName })
      .from(subjects)
      .leftJoin(
        staff,
        and(eq(staff.tenantId, subjects.tenantId), eq(staff.id, subjects.teacherStaffId)),
      )
      .where(where)
      .orderBy(sql`lower(${subjects.name})`)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(subjects).where(where),
  ]);
  const items = rows.map((r) => ({ ...r.subject, teacherName: r.teacherName }));
  return toPage(items, total, pageInput);
}

/** Staff who can teach: Active, with the work type "Teacher". */
function isTeacher() {
  return and(eq(staff.status, "active"), sql`lower(${workTypes.name}) = 'teacher'`);
}

/** Active staff with the work type Teacher, for the Assign teacher list. */
export async function listTeacherOptions(
  ctx: TenantContext,
): Promise<{ id: string; fullName: string; phone: string | null }[]> {
  assertCanManage(ctx);
  return getDb()
    .select({ id: staff.id, fullName: staff.fullName, phone: staff.phone })
    .from(staff)
    .innerJoin(
      workTypes,
      and(eq(workTypes.tenantId, staff.tenantId), eq(workTypes.id, staff.workTypeId)),
    )
    .where(and(eq(staff.tenantId, ctx.tenantId), isTeacher()))
    .orderBy(sql`lower(${staff.fullName})`);
}

/**
 * Give a subject its teacher (replacing any earlier one), or clear it with
 * null. Only Active staff with the work type Teacher can be chosen.
 */
export async function assignSubjectTeacher(
  ctx: TenantContext,
  subjectId: string,
  input: unknown,
): Promise<Subject> {
  assertCanManage(ctx);
  const id = parseId(subjectId);
  const { staffId } = parseInput(assignTeacherSchema, input);
  return getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, id)))
      .for("update");
    if (!before) throw new NotFoundError();
    let teacherName: string | null = null;
    // Keeping the same teacher is always allowed; a new one must qualify.
    if (staffId && staffId !== before.teacherStaffId) {
      const [teacher] = await tx
        .select({ fullName: staff.fullName })
        .from(staff)
        .innerJoin(
          workTypes,
          and(eq(workTypes.tenantId, staff.tenantId), eq(workTypes.id, staff.workTypeId)),
        )
        .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, staffId), isTeacher()));
      if (!teacher) {
        throw new ValidationError(undefined, {
          staffId: ["Choose an Active staff member whose work type is Teacher."],
        });
      }
      teacherName = teacher.fullName;
    }
    const [updated] = await tx
      .update(subjects)
      .set({ teacherStaffId: staffId })
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, id)))
      .returning();
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "subject.teacher_assigned",
        entityType: "subject",
        entityId: id,
        before: { teacherStaffId: before.teacherStaffId },
        after: { teacherStaffId: staffId, teacherName },
      },
      tx,
    );
    return updated;
  });
}

export async function createSubject(ctx: TenantContext, input: unknown): Promise<Subject> {
  assertCanManage(ctx);
  const data = parseInput(subjectInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(subjects)
        .values({ ...data, code: await nextSubjectCode(tx, ctx.tenantId), tenantId: ctx.tenantId })
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "subject.created",
          entityType: "subject",
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

export async function updateSubject(
  ctx: TenantContext,
  subjectId: string,
  input: unknown,
): Promise<Subject> {
  assertCanManage(ctx);
  const id = parseId(subjectId);
  const data = parseInput(subjectInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(subjects)
        .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, id)))
        .for("update");
      if (!before) throw new NotFoundError();
      const [updated] = await tx
        .update(subjects)
        .set(data)
        .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, id)))
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "subject.updated",
          entityType: "subject",
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

/** Permanently delete a subject (confirmed in the UI). The audit log keeps a copy. */
export async function deleteSubject(ctx: TenantContext, subjectId: string): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(subjectId);
  await getDb().transaction(async (tx) => {
    if (await hasMarks(tx, ctx.tenantId, { subjectId: id })) {
      throw new InvalidStateError(
        "This subject has exam marks and cannot be deleted. Set it to Inactive instead.",
      );
    }
    const [removed] = await tx
      .delete(subjects)
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, id)))
      .returning();
    if (!removed) throw new NotFoundError();
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "subject.deleted",
        entityType: "subject",
        entityId: id,
        before: removed,
      },
      tx,
    );
  });
}
