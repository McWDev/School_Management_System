import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import {
  academicYears,
  classes,
  staff,
  studentEnrollments,
  studentPhotos,
  students,
  subjectMarks,
  subjects,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertPermission, can, hasAllBranches, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  average,
  fromHundredths,
  MARK_PARTS,
  marksInputSchema,
  studentMarksInputSchema,
  passes,
  subjectTotal,
  toHundredths,
  type MarkPart,
} from "./schemas";

/*
 * Examination marks of the current school: choose a class (and year), then a
 * subject, and fill each student's Midterm, Activities and Final. Reading
 * needs exams.read. Entering needs exams.manage (with access to all
 * branches), or exams.enter_marks for the subjects the user teaches (the
 * subject's teacher is their staff record). Every query is limited to
 * ctx.tenantId and every change is audited.
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Transaction | ReturnType<typeof getDb>;

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/** Exam administrators may enter marks for every subject. */
export function canManageExams(ctx: TenantContext) {
  return can(ctx, "exams.manage") && hasAllBranches(ctx);
}

/** The staff id of the signed-in user, if their login belongs to a staff member. */
async function actorStaffId(executor: Executor, ctx: TenantContext) {
  if (!ctx.actorUserId) return null;
  const [row] = await executor
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.userId, ctx.actorUserId)));
  return row?.id ?? null;
}

// ---------------------------------------------------------------- choices

export type ExamChoices = {
  academicYears: { id: string; name: string; status: "upcoming" | "current" | "closed" }[];
  classes: { id: string; name: string; status: "active" | "inactive" }[];
  /** Active subjects, with whether the current user may enter their marks. */
  subjects: {
    id: string;
    name: string;
    code: string;
    teacherName: string | null;
    canEnter: boolean;
  }[];
};

export async function getExamChoices(ctx: TenantContext): Promise<ExamChoices> {
  assertPermission(ctx, "exams.read");
  const db = getDb();
  const [years, classRows, subjectRows, myStaffId] = await Promise.all([
    db
      .select({ id: academicYears.id, name: academicYears.name, status: academicYears.status })
      .from(academicYears)
      .where(eq(academicYears.tenantId, ctx.tenantId))
      .orderBy(
        sql`case ${academicYears.status} when 'current' then 0 when 'upcoming' then 1 else 2 end`,
        desc(academicYears.name),
      ),
    db
      .select({ id: classes.id, name: classes.name, status: classes.status })
      .from(classes)
      .where(eq(classes.tenantId, ctx.tenantId))
      .orderBy(
        sql`lower(regexp_replace(${classes.name}, '[0-9].*$', ''))`,
        sql`nullif(substring(${classes.name} from '[0-9]+'), '')::int nulls first`,
        sql`lower(${classes.name})`,
      ),
    db
      .select({
        id: subjects.id,
        name: subjects.name,
        code: subjects.code,
        teacherStaffId: subjects.teacherStaffId,
        teacherName: staff.fullName,
      })
      .from(subjects)
      .leftJoin(
        staff,
        and(eq(staff.tenantId, subjects.tenantId), eq(staff.id, subjects.teacherStaffId)),
      )
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.status, "active")))
      .orderBy(sql`lower(${subjects.name})`),
    actorStaffId(db, ctx),
  ]);
  const manager = canManageExams(ctx);
  const enterer = can(ctx, "exams.enter_marks");
  return {
    academicYears: years,
    classes: classRows,
    subjects: subjectRows.map(({ teacherStaffId, ...s }) => ({
      ...s,
      canEnter: manager || (enterer && myStaffId !== null && teacherStaffId === myStaffId),
    })),
  };
}

// ---------------------------------------------------------------- students

/** Active students placed in the class for the year, plus anyone already marked there. */
function classStudentsWhere(tenantId: string, classId: string, yearId: string) {
  return and(
    eq(students.tenantId, tenantId),
    sql`(
      (${students.status} = 'active' and exists (
        select 1 from ${studentEnrollments}
        where ${studentEnrollments.studentId} = ${students.id}
          and ${studentEnrollments.classId} = ${classId}
          and ${studentEnrollments.academicYearId} = ${yearId}))
      or exists (
        select 1 from ${subjectMarks}
        where ${subjectMarks.studentId} = ${students.id}
          and ${subjectMarks.classId} = ${classId}
          and ${subjectMarks.academicYearId} = ${yearId}))`,
  );
}

async function checkClassAndYear(
  executor: Executor,
  ctx: TenantContext,
  classId: string,
  yearId: string,
) {
  const [[cls], [year]] = await Promise.all([
    executor
      .select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(and(eq(classes.tenantId, ctx.tenantId), eq(classes.id, classId))),
    executor
      .select({ id: academicYears.id, name: academicYears.name })
      .from(academicYears)
      .where(and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.id, yearId))),
  ]);
  if (!cls || !year) throw new NotFoundError();
  return { className: cls.name, academicYearName: year.name };
}

// ------------------------------------------------------------------ marks

export type MarksRow = {
  studentId: string;
  studentNumber: string;
  fullName: string;
} & Record<MarkPart, string | null>;

/** Every student of the class with their marks in one subject. */
export async function getSubjectMarks(
  ctx: TenantContext,
  input: { academicYearId: string; classId: string; subjectId: string },
): Promise<{ className: string; academicYearName: string; subjectName: string; rows: MarksRow[] }> {
  assertPermission(ctx, "exams.read");
  const yearId = parseId(input.academicYearId);
  const classId = parseId(input.classId);
  const subjectId = parseId(input.subjectId);
  const db = getDb();
  const [names, [subject]] = await Promise.all([
    checkClassAndYear(db, ctx, classId, yearId),
    db
      .select({ name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, subjectId))),
  ]);
  if (!subject) throw new NotFoundError();
  const rows = await db
    .select({
      studentId: students.id,
      studentNumber: students.studentNumber,
      fullName: students.fullName,
      midterm: subjectMarks.midterm,
      activities: subjectMarks.activities,
      final: subjectMarks.final,
    })
    .from(students)
    .leftJoin(
      subjectMarks,
      and(
        eq(subjectMarks.tenantId, students.tenantId),
        eq(subjectMarks.studentId, students.id),
        eq(subjectMarks.subjectId, subjectId),
        eq(subjectMarks.academicYearId, yearId),
      ),
    )
    .where(classStudentsWhere(ctx.tenantId, classId, yearId))
    .orderBy(sql`lower(${students.fullName})`, students.studentNumber);
  const tidy = (v: string | null) => (v === null ? null : fromHundredths(toHundredths(v)));
  return {
    ...names,
    subjectName: subject.name,
    rows: rows.map((r) => ({
      ...r,
      midterm: tidy(r.midterm),
      activities: tidy(r.activities),
      final: tidy(r.final),
    })),
  };
}

/**
 * Save Midterm, Activities and Final of a class in one subject. Each part
 * must be within its maximum; a student with all three parts empty has no
 * marks for the subject.
 */
export async function saveSubjectMarks(
  ctx: TenantContext,
  target: { academicYearId: string; classId: string; subjectId: string },
  input: unknown,
): Promise<{ saved: number; cleared: number }> {
  if (!can(ctx, "exams.manage") && !can(ctx, "exams.enter_marks")) throw new ForbiddenError();
  const yearId = parseId(target.academicYearId);
  const classId = parseId(target.classId);
  const subjectId = parseId(target.subjectId);
  const { entries } = parseInput(marksInputSchema, input);

  return getDb().transaction(async (tx) => {
    const names = await checkClassAndYear(tx, ctx, classId, yearId);
    const [subject] = await tx
      .select({ name: subjects.name, teacherStaffId: subjects.teacherStaffId })
      .from(subjects)
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.id, subjectId)));
    if (!subject) throw new NotFoundError();
    if (!canManageExams(ctx)) {
      assertPermission(ctx, "exams.enter_marks");
      const mine = await actorStaffId(tx, ctx);
      if (!mine || subject.teacherStaffId !== mine) {
        throw new ForbiddenError("You can enter marks only for the subjects you teach.");
      }
    }

    const allowed = new Set(
      (
        await tx
          .select({ id: students.id })
          .from(students)
          .where(classStudentsWhere(ctx.tenantId, classId, yearId))
      ).map((s) => s.id),
    );
    const fieldErrors: Record<string, string[]> = {};
    for (const entry of entries) {
      if (!allowed.has(entry.studentId)) throw new NotFoundError();
      for (const part of MARK_PARTS) {
        const value = entry[part.key];
        if (value !== "" && toHundredths(value) > part.max * 100) {
          fieldErrors[`${part.key}:${entry.studentId}`] = [`Use at most ${part.max}.`];
        }
      }
    }
    if (Object.keys(fieldErrors).length) {
      throw new ValidationError(
        "Midterm is out of 30, Activities out of 20 and Final out of 50.",
        fieldErrors,
      );
    }

    const blank = (e: (typeof entries)[number]) => MARK_PARTS.every((p) => e[p.key] === "");
    const toSave = entries.filter((e) => !blank(e));
    const toClear = entries.filter(blank).map((e) => e.studentId);
    for (const entry of toSave) {
      const values = {
        midterm: entry.midterm || null,
        activities: entry.activities || null,
        final: entry.final || null,
      };
      await tx
        .insert(subjectMarks)
        .values({
          tenantId: ctx.tenantId,
          academicYearId: yearId,
          classId,
          subjectId,
          studentId: entry.studentId,
          ...values,
          enteredByUserId: ctx.actorUserId,
        })
        .onConflictDoUpdate({
          target: [subjectMarks.studentId, subjectMarks.subjectId, subjectMarks.academicYearId],
          set: { ...values, classId, enteredByUserId: ctx.actorUserId, updatedAt: new Date() },
        });
    }
    if (toClear.length) {
      await tx
        .delete(subjectMarks)
        .where(
          and(
            eq(subjectMarks.tenantId, ctx.tenantId),
            eq(subjectMarks.subjectId, subjectId),
            eq(subjectMarks.academicYearId, yearId),
            inArray(subjectMarks.studentId, toClear),
          ),
        );
    }
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "exam.marks_saved",
        entityType: "subject",
        entityId: subjectId,
        after: {
          subject: subject.name,
          className: names.className,
          academicYear: names.academicYearName,
          marks: toSave,
          cleared: toClear,
        },
      },
      tx,
    );
    return { saved: toSave.length, cleared: toClear.length };
  });
}

/** How many students of the class have marks, per subject (for the subject list). */
export async function countMarkedBySubject(
  ctx: TenantContext,
  input: { academicYearId: string; classId: string },
): Promise<{ students: number; marked: Record<string, number> }> {
  assertPermission(ctx, "exams.read");
  const yearId = parseId(input.academicYearId);
  const classId = parseId(input.classId);
  const db = getDb();
  await checkClassAndYear(db, ctx, classId, yearId);
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(students)
      .where(classStudentsWhere(ctx.tenantId, classId, yearId)),
    db
      .select({ subjectId: subjectMarks.subjectId, total: count() })
      .from(subjectMarks)
      .where(
        and(
          eq(subjectMarks.tenantId, ctx.tenantId),
          eq(subjectMarks.classId, classId),
          eq(subjectMarks.academicYearId, yearId),
        ),
      )
      .groupBy(subjectMarks.subjectId),
  ]);
  return { students: total, marked: Object.fromEntries(rows.map((r) => [r.subjectId, r.total])) };
}

// ----------------------------------------------------------------- results

export type ClassResults = {
  className: string;
  academicYearName: string;
  /** All Active subjects, plus inactive ones with marks here (all of them count). */
  subjects: { id: string; name: string }[];
  rows: {
    studentId: string;
    studentNumber: string;
    fullName: string;
    /** Subject total out of 100 per subject id; null when the student has no marks there. */
    totals: Record<string, string | null>;
    total: string;
    average: string;
    result: "pass" | "fail";
    /** Subjects without marks (counted as 0). */
    missing: number;
  }[];
};

/**
 * Each student's subject totals, overall total, average over all the
 * school's subjects (product owner, 2026-10-19: a subject without marks
 * counts as 0) and Pass (average 50 or more) or Fail.
 */
export async function getClassResults(
  ctx: TenantContext,
  input: { academicYearId: string; classId: string },
): Promise<ClassResults> {
  assertPermission(ctx, "exams.read");
  const yearId = parseId(input.academicYearId);
  const classId = parseId(input.classId);
  const db = getDb();
  const names = await checkClassAndYear(db, ctx, classId, yearId);
  const [studentRows, markRows, activeSubjects] = await Promise.all([
    db
      .select({
        id: students.id,
        studentNumber: students.studentNumber,
        fullName: students.fullName,
      })
      .from(students)
      .where(classStudentsWhere(ctx.tenantId, classId, yearId))
      .orderBy(sql`lower(${students.fullName})`, students.studentNumber),
    db
      .select({
        studentId: subjectMarks.studentId,
        subjectId: subjectMarks.subjectId,
        subjectName: subjects.name,
        midterm: subjectMarks.midterm,
        activities: subjectMarks.activities,
        final: subjectMarks.final,
      })
      .from(subjectMarks)
      .innerJoin(
        subjects,
        and(eq(subjects.tenantId, subjectMarks.tenantId), eq(subjects.id, subjectMarks.subjectId)),
      )
      .where(
        and(
          eq(subjectMarks.tenantId, ctx.tenantId),
          eq(subjectMarks.classId, classId),
          eq(subjectMarks.academicYearId, yearId),
        ),
      ),
    db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.tenantId, ctx.tenantId), eq(subjects.status, "active"))),
  ]);
  const subjectList = [
    ...new Map([
      ...activeSubjects.map((s) => [s.id, s.name] as const),
      ...markRows.map((m) => [m.subjectId, m.subjectName] as const),
    ]).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = studentRows.map((s) => {
    const totals: Record<string, string | null> = {};
    const values: number[] = [];
    let missing = 0;
    for (const subject of subjectList) {
      const mark = markRows.find((m) => m.studentId === s.id && m.subjectId === subject.id);
      if (mark) {
        const t = subjectTotal(mark);
        totals[subject.id] = fromHundredths(t);
        values.push(t);
      } else {
        totals[subject.id] = null;
        values.push(0);
        missing += 1;
      }
    }
    const avg = average(values);
    return {
      studentId: s.id,
      studentNumber: s.studentNumber,
      fullName: s.fullName,
      totals,
      total: fromHundredths(values.reduce((a, b) => a + b, 0)),
      average: avg,
      result: passes(values) ? ("pass" as const) : ("fail" as const),
      missing,
    };
  });
  return { ...names, subjects: subjectList, rows };
}

/** Whether a record has marks (academic history is never deleted). */
export async function hasMarks(
  tx: Transaction,
  tenantId: string,
  where:
    | { studentId: string }
    | { classId: string }
    | { subjectId: string }
    | { academicYearId: string },
) {
  const condition =
    "studentId" in where
      ? eq(subjectMarks.studentId, where.studentId)
      : "classId" in where
        ? eq(subjectMarks.classId, where.classId)
        : "subjectId" in where
          ? eq(subjectMarks.subjectId, where.subjectId)
          : eq(subjectMarks.academicYearId, where.academicYearId);
  const [{ total }] = await tx
    .select({ total: count() })
    .from(subjectMarks)
    .where(and(eq(subjectMarks.tenantId, tenantId), condition));
  return total > 0;
}

// ---------------------------------------------------------- one student

export type StudentResult = {
  student: {
    id: string;
    studentNumber: string;
    fullName: string;
    gender: "male" | "female";
    /** Changes when the photo changes (cache-busting); null without a photo. */
    photoVersion: number | null;
  };
  className: string;
  academicYearName: string;
  /** The same subjects as the class results, so the average matches. */
  subjects: ({
    id: string;
    name: string;
    code: string;
    teacherName: string | null;
    canEnter: boolean;
    total: string | null;
  } & Record<MarkPart, string | null>)[];
  total: string;
  maxTotal: number;
  average: string;
  result: "pass" | "fail";
  /** Position in the class by total (1 = best); equal totals share a place. */
  position: number;
  classSize: number;
  /** Neighbours in the class list, for stepping through results. */
  previous: { id: string; fullName: string } | null;
  next: { id: string; fullName: string } | null;
};

/** One student's marks in every subject, with total, average and Pass/Fail. */
export async function getStudentResult(
  ctx: TenantContext,
  input: { academicYearId: string; classId: string; studentId: string },
): Promise<StudentResult> {
  const studentId = parseId(input.studentId);
  const results = await getClassResults(ctx, input);
  const index = results.rows.findIndex((r) => r.studentId === studentId);
  if (index < 0) throw new NotFoundError();
  const row = results.rows[index];
  const neighbour = (r: (typeof results.rows)[number] | undefined) =>
    r ? { id: r.studentId, fullName: r.fullName } : null;
  const db = getDb();
  const [[student], marks, subjectRows, myStaffId] = await Promise.all([
    db
      .select({
        id: students.id,
        studentNumber: students.studentNumber,
        fullName: students.fullName,
        gender: students.gender,
        photoUpdatedAt: studentPhotos.updatedAt,
      })
      .from(students)
      .leftJoin(
        studentPhotos,
        and(
          eq(studentPhotos.tenantId, students.tenantId),
          eq(studentPhotos.studentId, students.id),
        ),
      )
      .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, studentId))),
    db
      .select()
      .from(subjectMarks)
      .where(
        and(
          eq(subjectMarks.tenantId, ctx.tenantId),
          eq(subjectMarks.studentId, studentId),
          eq(subjectMarks.academicYearId, parseId(input.academicYearId)),
        ),
      ),
    results.subjects.length
      ? db
          .select({
            id: subjects.id,
            code: subjects.code,
            teacherStaffId: subjects.teacherStaffId,
            teacherName: staff.fullName,
          })
          .from(subjects)
          .leftJoin(
            staff,
            and(eq(staff.tenantId, subjects.tenantId), eq(staff.id, subjects.teacherStaffId)),
          )
          .where(
            and(
              eq(subjects.tenantId, ctx.tenantId),
              inArray(
                subjects.id,
                results.subjects.map((s) => s.id),
              ),
            ),
          )
      : [],
    actorStaffId(db, ctx),
  ]);
  const manager = canManageExams(ctx);
  const enterer = can(ctx, "exams.enter_marks");
  const tidy = (v: string | null | undefined) =>
    v === null || v === undefined ? null : fromHundredths(toHundredths(v));
  // Everyone has the same subjects, so ranking by total ranks by average.
  const mine = toHundredths(row.total);
  const { photoUpdatedAt, ...studentFields } = student;
  return {
    student: { ...studentFields, photoVersion: photoUpdatedAt ? photoUpdatedAt.getTime() : null },
    className: results.className,
    academicYearName: results.academicYearName,
    subjects: results.subjects.map((s) => {
      const mark = marks.find((m) => m.subjectId === s.id);
      const info = subjectRows.find((x) => x.id === s.id);
      return {
        id: s.id,
        name: s.name,
        code: info?.code ?? "",
        teacherName: info?.teacherName ?? null,
        canEnter: manager || (enterer && myStaffId !== null && info?.teacherStaffId === myStaffId),
        midterm: tidy(mark?.midterm),
        activities: tidy(mark?.activities),
        final: tidy(mark?.final),
        total: row.totals[s.id],
      };
    }),
    total: row.total,
    maxTotal: results.subjects.length * 100,
    average: row.average,
    result: row.result,
    position: 1 + results.rows.filter((r) => toHundredths(r.total) > mine).length,
    classSize: results.rows.length,
    previous: neighbour(results.rows[index - 1]),
    next: neighbour(results.rows[index + 1]),
  };
}

/**
 * Save one student's Midterm, Activities and Final in several subjects. Each
 * subject is checked on its own: teachers may save only the subjects they
 * teach. All three parts empty removes the student's marks in that subject.
 */
export async function saveStudentMarks(
  ctx: TenantContext,
  target: { academicYearId: string; classId: string; studentId: string },
  input: unknown,
): Promise<{ saved: number; cleared: number }> {
  if (!can(ctx, "exams.manage") && !can(ctx, "exams.enter_marks")) throw new ForbiddenError();
  const yearId = parseId(target.academicYearId);
  const classId = parseId(target.classId);
  const studentId = parseId(target.studentId);
  const { entries } = parseInput(studentMarksInputSchema, input);

  return getDb().transaction(async (tx) => {
    const names = await checkClassAndYear(tx, ctx, classId, yearId);
    const [student] = await tx
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(and(classStudentsWhere(ctx.tenantId, classId, yearId), eq(students.id, studentId)));
    if (!student) throw new NotFoundError();

    const subjectIds = [...new Set(entries.map((e) => e.subjectId))];
    const found = subjectIds.length
      ? await tx
          .select({ id: subjects.id, name: subjects.name, teacherStaffId: subjects.teacherStaffId })
          .from(subjects)
          .where(and(eq(subjects.tenantId, ctx.tenantId), inArray(subjects.id, subjectIds)))
      : [];
    if (found.length !== subjectIds.length) throw new NotFoundError();
    if (!canManageExams(ctx)) {
      assertPermission(ctx, "exams.enter_marks");
      const mine = await actorStaffId(tx, ctx);
      const notMine = found.find((s) => !mine || s.teacherStaffId !== mine);
      if (notMine) {
        throw new ForbiddenError(
          `You can enter marks only for the subjects you teach (not ${notMine.name}).`,
        );
      }
    }

    const fieldErrors: Record<string, string[]> = {};
    for (const entry of entries) {
      for (const part of MARK_PARTS) {
        const value = entry[part.key];
        if (value !== "" && toHundredths(value) > part.max * 100) {
          fieldErrors[`${part.key}:${entry.subjectId}`] = [`Use at most ${part.max}.`];
        }
      }
    }
    if (Object.keys(fieldErrors).length) {
      throw new ValidationError(
        "Midterm is out of 30, Activities out of 20 and Final out of 50.",
        fieldErrors,
      );
    }

    const blank = (e: (typeof entries)[number]) => MARK_PARTS.every((p) => e[p.key] === "");
    const toSave = entries.filter((e) => !blank(e));
    const toClear = entries.filter(blank).map((e) => e.subjectId);
    for (const entry of toSave) {
      const values = {
        midterm: entry.midterm || null,
        activities: entry.activities || null,
        final: entry.final || null,
      };
      await tx
        .insert(subjectMarks)
        .values({
          tenantId: ctx.tenantId,
          academicYearId: yearId,
          classId,
          subjectId: entry.subjectId,
          studentId,
          ...values,
          enteredByUserId: ctx.actorUserId,
        })
        .onConflictDoUpdate({
          target: [subjectMarks.studentId, subjectMarks.subjectId, subjectMarks.academicYearId],
          set: { ...values, classId, enteredByUserId: ctx.actorUserId, updatedAt: new Date() },
        });
    }
    if (toClear.length) {
      await tx
        .delete(subjectMarks)
        .where(
          and(
            eq(subjectMarks.tenantId, ctx.tenantId),
            eq(subjectMarks.studentId, studentId),
            eq(subjectMarks.academicYearId, yearId),
            inArray(subjectMarks.subjectId, toClear),
          ),
        );
    }
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "exam.student_marks_saved",
        entityType: "student",
        entityId: studentId,
        after: {
          student: student.fullName,
          className: names.className,
          academicYear: names.academicYearName,
          marks: toSave,
          cleared: toClear,
        },
      },
      tx,
    );
    return { saved: toSave.length, cleared: toClear.length };
  });
}
