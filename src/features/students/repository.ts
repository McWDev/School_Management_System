import "server-only";
import { and, asc, count, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import {
  academicYears,
  classes,
  studentEnrollments,
  studentNumberCounters,
  studentPhotos,
  students,
  tenants,
  type Student,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  ForbiddenError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { checkImage } from "@/lib/images";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, assertPermission, can, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  formatStudentNumber,
  studentInputSchema,
  studentListFilterSchema,
  type StudentInput,
} from "./schemas";

/*
 * Students of the current school, each placed in a class for an academic year
 * (student_enrollments). Students are school-wide: reading needs
 * students.read; registering needs students.create, editing students.update,
 * and changing the status or deleting needs students.archive, always with
 * access to all branches. Only Active students take a class seat, and a class
 * never holds more Active students than its seats in one year. Every query is
 * limited to ctx.tenantId and every change is audited.
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCan(
  ctx: TenantContext,
  permission: "students.create" | "students.update" | "students.archive",
) {
  assertPermission(ctx, permission);
  assertAllBranches(ctx);
}

/** The latest enrollment of each student (their current class and year). */
function latestEnrollment() {
  return getDb()
    .select({
      enrollmentId: studentEnrollments.id,
      classId: studentEnrollments.classId,
      academicYearId: studentEnrollments.academicYearId,
    })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.tenantId, students.tenantId),
        eq(studentEnrollments.studentId, students.id),
      ),
    )
    .orderBy(desc(studentEnrollments.createdAt))
    .limit(1)
    .as("latest");
}

type FeeColumns = "feeType" | "feeAmount" | "registrationFee" | "registrationFeePaid";
export type StudentFees = Pick<Student, FeeColumns>;

/** Fee details are shown to those who register or edit students, and to finance. */
export function canSeeFees(ctx: TenantContext) {
  return can(ctx, "students.create") || can(ctx, "students.update") || can(ctx, "fees.read");
}

export type StudentSummary = Omit<Student, FeeColumns> & {
  /** Fee details; null for users who may not see them (e.g. teachers). */
  fees: StudentFees | null;
  classId: string | null;
  className: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
  photoVersion: number | null;
};

export async function listStudents(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<StudentSummary>> {
  assertPermission(ctx, "students.read");
  const { status, classId, academicYearId, search } = studentListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);
  const latest = latestEnrollment();

  const conditions: (SQL | undefined)[] = [
    eq(students.tenantId, ctx.tenantId),
    status ? eq(students.status, status) : undefined,
    classId ? eq(latest.classId, classId) : undefined,
    academicYearId ? eq(latest.academicYearId, academicYearId) : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(students.fullName, pattern),
        ilike(students.studentNumber, pattern),
        ilike(students.guardianName, pattern),
        ilike(students.guardianPhone, pattern),
        ilike(students.phone, pattern),
      ),
    );
  }
  const where = and(...conditions);
  const db = getDb();

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        student: students,
        classId: latest.classId,
        className: classes.name,
        academicYearId: latest.academicYearId,
        academicYearName: academicYears.name,
        photoUpdatedAt: studentPhotos.updatedAt,
      })
      .from(students)
      .leftJoinLateral(latest, sql`true`)
      .leftJoin(
        classes,
        and(eq(classes.tenantId, students.tenantId), eq(classes.id, latest.classId)),
      )
      .leftJoin(
        academicYears,
        and(
          eq(academicYears.tenantId, students.tenantId),
          eq(academicYears.id, latest.academicYearId),
        ),
      )
      .leftJoin(
        studentPhotos,
        and(
          eq(studentPhotos.tenantId, students.tenantId),
          eq(studentPhotos.studentId, students.id),
        ),
      )
      .where(where)
      .orderBy(asc(sql`lower(${students.fullName})`), students.id)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db
      .select({ total: count() })
      .from(students)
      .leftJoinLateral(latest, sql`true`)
      .where(where),
  ]);
  const showFees = canSeeFees(ctx);
  const items = rows.map(({ student, ...row }) => {
    const { feeType, feeAmount, registrationFee, registrationFeePaid, ...rest } = student;
    return {
      ...rest,
      fees: showFees ? { feeType, feeAmount, registrationFee, registrationFeePaid } : null,
      classId: row.classId,
      className: row.className,
      academicYearId: row.academicYearId,
      academicYearName: row.academicYearName,
      photoVersion: row.photoUpdatedAt ? row.photoUpdatedAt.getTime() : null,
    };
  });
  return toPage(items, total, pageInput);
}

export type StudentFormOptions = {
  classes: { id: string; name: string; seats: number; status: "active" | "inactive" }[];
  academicYears: { id: string; name: string; status: "upcoming" | "current" | "closed" }[];
  /** The school's currency, e.g. "USD". */
  currencyCode: string;
  /** Active students per class and year, keyed "classId:academicYearId". */
  seatsTaken: Record<string, number>;
};

/** Classes, academic years and seats taken, for the student form and filters. */
export async function getStudentFormOptions(ctx: TenantContext): Promise<StudentFormOptions> {
  assertPermission(ctx, "students.read");
  const db = getDb();
  const [classRows, yearRows, taken, [school]] = await Promise.all([
    db
      .select({ id: classes.id, name: classes.name, seats: classes.seats, status: classes.status })
      .from(classes)
      .where(eq(classes.tenantId, ctx.tenantId))
      .orderBy(
        sql`lower(regexp_replace(${classes.name}, '[0-9].*$', ''))`,
        sql`nullif(substring(${classes.name} from '[0-9]+'), '')::int nulls first`,
        sql`lower(${classes.name})`,
      ),
    db
      .select({ id: academicYears.id, name: academicYears.name, status: academicYears.status })
      .from(academicYears)
      .where(eq(academicYears.tenantId, ctx.tenantId))
      .orderBy(
        sql`case ${academicYears.status} when 'current' then 0 when 'upcoming' then 1 else 2 end`,
        desc(academicYears.name),
      ),
    db
      .select({
        classId: studentEnrollments.classId,
        academicYearId: studentEnrollments.academicYearId,
        total: count(),
      })
      .from(studentEnrollments)
      .innerJoin(
        students,
        and(
          eq(students.tenantId, studentEnrollments.tenantId),
          eq(students.id, studentEnrollments.studentId),
        ),
      )
      .where(and(eq(studentEnrollments.tenantId, ctx.tenantId), eq(students.status, "active")))
      .groupBy(studentEnrollments.classId, studentEnrollments.academicYearId),
    db
      .select({ currencyCode: tenants.currencyCode })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId)),
  ]);
  return {
    classes: classRows,
    academicYears: yearRows,
    currencyCode: school?.currencyCode ?? "USD",
    seatsTaken: Object.fromEntries(taken.map((t) => [`${t.classId}:${t.academicYearId}`, t.total])),
  };
}

/** Active students in a class for a year, optionally not counting one student. */
async function countActiveInClass(
  tx: Transaction,
  ctx: TenantContext,
  classId: string,
  academicYearId: string,
  exceptStudentId?: string,
) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(studentEnrollments)
    .innerJoin(
      students,
      and(
        eq(students.tenantId, studentEnrollments.tenantId),
        eq(students.id, studentEnrollments.studentId),
      ),
    )
    .where(
      and(
        eq(studentEnrollments.tenantId, ctx.tenantId),
        eq(studentEnrollments.classId, classId),
        eq(studentEnrollments.academicYearId, academicYearId),
        eq(students.status, "active"),
        exceptStudentId ? ne(students.id, exceptStudentId) : undefined,
      ),
    );
  return total;
}

/**
 * Check the class and year of a placement. A new placement needs an Active
 * class, a year that is not Closed, and (for an Active student) a free seat.
 * The class row is locked so two registrations cannot take the last seat.
 */
async function checkPlacement(
  tx: Transaction,
  ctx: TenantContext,
  data: StudentInput,
  options: { isNewPlacement: boolean; needsSeat: boolean; studentId?: string },
) {
  const [schoolClass] = await tx
    .select()
    .from(classes)
    .where(and(eq(classes.tenantId, ctx.tenantId), eq(classes.id, data.classId)))
    .for("update");
  if (!schoolClass) throw new ValidationError(undefined, { classId: ["Choose a class."] });
  const [year] = await tx
    .select()
    .from(academicYears)
    .where(
      and(eq(academicYears.tenantId, ctx.tenantId), eq(academicYears.id, data.academicYearId)),
    );
  if (!year) {
    throw new ValidationError(undefined, { academicYearId: ["Choose an academic year."] });
  }

  if (options.isNewPlacement && schoolClass.status !== "active") {
    throw new ValidationError(undefined, {
      classId: [`${schoolClass.name} is Inactive. Choose an Active class.`],
    });
  }
  if (options.isNewPlacement && year.status === "closed") {
    throw new ValidationError(undefined, {
      academicYearId: [`${year.name} is Closed. Choose the Current or an Upcoming year.`],
    });
  }
  if (options.needsSeat) {
    const taken = await countActiveInClass(tx, ctx, schoolClass.id, year.id, options.studentId);
    if (taken >= schoolClass.seats) {
      throw new ValidationError(undefined, {
        classId: [
          `${schoolClass.name} is full: ${schoolClass.seats === 1 ? "its 1 seat is" : `all ${schoolClass.seats} seats are`} taken in ${year.name}.`,
        ],
      });
    }
  }
  return { className: schoolClass.name, academicYearName: year.name };
}

function checkPhoto(photo: Uint8Array | null | undefined) {
  if (!photo || photo.length === 0) return null;
  const result = checkImage(photo, "photo");
  if (!result.ok) throw new ValidationError(result.message, { photo: [result.message] });
  return { type: result.type, data: Buffer.from(photo) };
}

async function savePhoto(
  tx: Transaction,
  tenantId: string,
  studentId: string,
  photo: { type: string; data: Buffer },
) {
  await tx
    .insert(studentPhotos)
    .values({
      studentId,
      tenantId,
      contentType: photo.type,
      byteSize: photo.data.length,
      data: photo.data,
    })
    .onConflictDoUpdate({
      target: studentPhotos.studentId,
      set: {
        contentType: photo.type,
        byteSize: photo.data.length,
        data: photo.data,
        updatedAt: new Date(),
      },
    });
}

/** The next Student ID of the school; numbers are never reused. */
async function nextStudentNumber(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .insert(studentNumberCounters)
    .values({ tenantId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: studentNumberCounters.tenantId,
      set: { lastNumber: sql`${studentNumberCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: studentNumberCounters.lastNumber });
  return formatStudentNumber(row.lastNumber);
}

/** The columns of the students table (class and year go to the enrollment). */
function studentFields(data: StudentInput) {
  return {
    fullName: data.fullName,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth,
    admissionDate: data.admissionDate,
    guardianName: data.guardianName,
    guardianPhone: data.guardianPhone,
    phone: data.phone ?? null,
    address: data.address ?? null,
    status: data.status,
    feeType: data.feeType,
    feeAmount: data.feeAmount,
    registrationFee: data.registrationFee,
    registrationFeePaid: data.registrationFeePaid,
  };
}

/**
 * Register a student with the next Student ID, placed in a class for an
 * academic year. A student with the same name and date of birth is reported
 * as a possible duplicate unless `confirmDuplicate` is set.
 */
export async function createStudent(
  ctx: TenantContext,
  input: unknown,
  options: { photo?: Uint8Array | null; confirmDuplicate?: boolean } = {},
): Promise<Student> {
  assertCan(ctx, "students.create");
  // New students are always Active.
  const data = { ...parseInput(studentInputSchema, input), status: "active" as const };
  const checkedPhoto = checkPhoto(options.photo);

  if (!options.confirmDuplicate) {
    const [twin] = await getDb()
      .select({ studentNumber: students.studentNumber })
      .from(students)
      .where(
        and(
          eq(students.tenantId, ctx.tenantId),
          sql`lower(${students.fullName}) = lower(${data.fullName})`,
          eq(students.dateOfBirth, data.dateOfBirth),
        ),
      )
      .limit(1);
    if (twin) {
      const message = `A student named ${data.fullName} with the same date of birth is already registered (${twin.studentNumber}).`;
      throw new ConflictError(message, { duplicate: [message] });
    }
  }

  try {
    return await getDb().transaction(async (tx) => {
      const placement = await checkPlacement(tx, ctx, data, {
        isNewPlacement: true,
        needsSeat: true,
      });
      const studentNumber = await nextStudentNumber(tx, ctx.tenantId);
      const [created] = await tx
        .insert(students)
        .values({ ...studentFields(data), tenantId: ctx.tenantId, studentNumber })
        .returning();
      await tx.insert(studentEnrollments).values({
        tenantId: ctx.tenantId,
        studentId: created.id,
        classId: data.classId,
        academicYearId: data.academicYearId,
      });
      if (checkedPhoto) await savePhoto(tx, ctx.tenantId, created.id, checkedPhoto);
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "student.created",
          entityType: "student",
          entityId: created.id,
          after: { ...created, ...placement, photo: Boolean(checkedPhoto) },
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "students_tenant_number_unique")) {
      throw new ConflictError("Another student was registered at the same time. Try again.");
    }
    throw error;
  }
}

/**
 * Edit a student. Changing the class or year corrects their current
 * placement. Changing the status needs students.archive. `photo` replaces the
 * photo; `removePhoto` deletes it.
 */
export async function updateStudent(
  ctx: TenantContext,
  studentId: string,
  input: unknown,
  options: { photo?: Uint8Array | null; removePhoto?: boolean } = {},
): Promise<Student> {
  assertCan(ctx, "students.update");
  const id = parseId(studentId);
  const data = parseInput(studentInputSchema, input);
  const checkedPhoto = checkPhoto(options.photo);

  try {
    return await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(students)
        .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, id)))
        .for("update");
      if (!before) throw new NotFoundError();
      if (data.status !== before.status && !can(ctx, "students.archive")) {
        throw new ForbiddenError("You do not have permission to change a student's status.");
      }

      const [enrollment] = await tx
        .select()
        .from(studentEnrollments)
        .where(
          and(eq(studentEnrollments.tenantId, ctx.tenantId), eq(studentEnrollments.studentId, id)),
        )
        .orderBy(desc(studentEnrollments.createdAt))
        .limit(1);
      const moved =
        !enrollment ||
        enrollment.classId !== data.classId ||
        enrollment.academicYearId !== data.academicYearId;
      const becomesActive = data.status === "active" && before.status !== "active";
      const placement = await checkPlacement(tx, ctx, data, {
        isNewPlacement: moved,
        needsSeat: data.status === "active" && (moved || becomesActive),
        studentId: id,
      });

      const [updated] = await tx
        .update(students)
        .set(studentFields(data))
        .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, id)))
        .returning();
      if (!enrollment) {
        await tx.insert(studentEnrollments).values({
          tenantId: ctx.tenantId,
          studentId: id,
          classId: data.classId,
          academicYearId: data.academicYearId,
        });
      } else if (moved) {
        await tx
          .update(studentEnrollments)
          .set({ classId: data.classId, academicYearId: data.academicYearId })
          .where(
            and(
              eq(studentEnrollments.tenantId, ctx.tenantId),
              eq(studentEnrollments.id, enrollment.id),
            ),
          );
      }
      if (checkedPhoto) {
        await savePhoto(tx, ctx.tenantId, id, checkedPhoto);
      } else if (options.removePhoto) {
        await tx
          .delete(studentPhotos)
          .where(and(eq(studentPhotos.tenantId, ctx.tenantId), eq(studentPhotos.studentId, id)));
      }
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "student.updated",
          entityType: "student",
          entityId: id,
          before: {
            ...before,
            classId: enrollment?.classId ?? null,
            academicYearId: enrollment?.academicYearId ?? null,
          },
          after: {
            ...updated,
            classId: data.classId,
            academicYearId: data.academicYearId,
            ...placement,
            photo: checkedPhoto ? "replaced" : options.removePhoto ? "removed" : "unchanged",
          },
        },
        tx,
      );
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error, "student_enrollments_student_year_unique")) {
      throw new ValidationError(undefined, {
        academicYearId: ["This student already has a class in that academic year."],
      });
    }
    throw error;
  }
}

/**
 * Permanently delete a student registered by mistake (confirmed in the UI),
 * with their enrollments and photo. The audit log keeps a copy. Students who
 * finish or leave should get a status instead, so their history is kept.
 */
export async function deleteStudent(ctx: TenantContext, studentId: string): Promise<void> {
  assertCan(ctx, "students.archive");
  const id = parseId(studentId);
  await getDb().transaction(async (tx) => {
    const enrollments = await tx
      .select({
        classId: studentEnrollments.classId,
        academicYearId: studentEnrollments.academicYearId,
      })
      .from(studentEnrollments)
      .where(
        and(eq(studentEnrollments.tenantId, ctx.tenantId), eq(studentEnrollments.studentId, id)),
      );
    // Enrollments and the photo go with the record (foreign key cascade).
    const [removed] = await tx
      .delete(students)
      .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, id)))
      .returning();
    if (!removed) throw new NotFoundError();
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "student.deleted",
        entityType: "student",
        entityId: id,
        before: { ...removed, enrollments },
      },
      tx,
    );
  });
}

/** A student photo of the actor's own school (needs students.read). */
export async function getStudentPhoto(
  ctx: TenantContext,
  studentId: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  assertPermission(ctx, "students.read");
  const id = uuidSchema.safeParse(studentId);
  if (!id.success) return null;
  const [row] = await getDb()
    .select({ contentType: studentPhotos.contentType, data: studentPhotos.data })
    .from(studentPhotos)
    .where(and(eq(studentPhotos.tenantId, ctx.tenantId), eq(studentPhotos.studentId, id.data)));
  return row ?? null;
}

/** Number of students (any status) placed in a class or a year. */
export async function countEnrollments(
  tx: Transaction,
  tenantId: string,
  where: { classId: string } | { academicYearId: string },
) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.tenantId, tenantId),
        "classId" in where
          ? eq(studentEnrollments.classId, where.classId)
          : eq(studentEnrollments.academicYearId, where.academicYearId),
      ),
    );
  return total;
}

/** The most Active students the class holds in any one year. */
export async function mostActiveInClass(tx: Transaction, tenantId: string, classId: string) {
  const rows = await tx
    .select({ total: count() })
    .from(studentEnrollments)
    .innerJoin(
      students,
      and(
        eq(students.tenantId, studentEnrollments.tenantId),
        eq(students.id, studentEnrollments.studentId),
      ),
    )
    .where(
      and(
        eq(studentEnrollments.tenantId, tenantId),
        eq(studentEnrollments.classId, classId),
        eq(students.status, "active"),
      ),
    )
    .groupBy(studentEnrollments.academicYearId);
  return Math.max(0, ...rows.map((r) => r.total));
}
