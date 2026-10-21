import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import {
  academicYears,
  classes,
  sessions,
  studentEnrollments,
  studentPhotos,
  students,
  tenants,
  users,
} from "@/db/schema";
import { latestEnrollment } from "@/features/students/latest-enrollment";
import { recordAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decryptPortalPassword, encryptPortalPassword } from "@/lib/auth/portal-secret";
import type { SessionUser } from "@/lib/auth/service";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { escapeLike } from "@/lib/pagination";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import { changePasswordSchema, portalFilterSchema, portalStudentIdsSchema } from "./schemas";

/*
 * Students Portal (step 11, product owner 2026-10-21): students sign in to see
 * their own profile, results and fees. The school gives access from School
 * Settings: each student gets a login (username = school code + Student ID)
 * and a random 6-digit password. Sign-in checks the password hash; the school
 * can see the password through an encrypted copy (product owner, 2026-10-21).
 * Managing logins needs students.update and access to all branches; every
 * change is audited without the passwords.
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCanManage(ctx: TenantContext) {
  assertPermission(ctx, "students.update");
  assertAllBranches(ctx);
}

/** A random 6-digit portal password, e.g. "042917". */
export function generatePassword(): string {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

/** "DEMO-HODAN" + "STU-0001" → "demo-hodan-stu-0001" (usernames are platform-wide). */
export function portalUsername(schoolCode: string, studentNumber: string) {
  return `${schoolCode}-${studentNumber}`.toLowerCase();
}

// ------------------------------------------------------------------ admin

export type PortalStudentRow = {
  id: string;
  studentNumber: string;
  fullName: string;
  status: "active" | "graduated" | "transferred" | "left";
  className: string | null;
  academicYearName: string | null;
  username: string | null;
  /** The portal password; null when there is no login or it cannot be read. */
  password: string | null;
  /** Login state: none yet, enabled, or turned off. */
  access: "none" | "active" | "disabled";
};

export async function listPortalStudents(
  ctx: TenantContext,
  filters: unknown = {},
): Promise<PortalStudentRow[]> {
  assertCanManage(ctx);
  const { academicYearId, classId, search, access } = portalFilterSchema.parse(filters);
  const latest = latestEnrollment();
  const conditions: (SQL | undefined)[] = [
    eq(students.tenantId, ctx.tenantId),
    academicYearId ? eq(latest.academicYearId, academicYearId) : undefined,
    classId ? eq(latest.classId, classId) : undefined,
    access === "none" ? isNull(students.userId) : undefined,
    access === "active" ? eq(users.status, "active") : undefined,
    access === "disabled" ? ne(users.status, "active") : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(or(ilike(students.fullName, pattern), ilike(students.studentNumber, pattern)));
  }
  const rows = await getDb()
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      fullName: students.fullName,
      status: students.status,
      className: classes.name,
      academicYearName: academicYears.name,
      username: users.username,
      accountStatus: users.status,
      portalPasswordEncrypted: students.portalPasswordEncrypted,
    })
    .from(students)
    .leftJoinLateral(latest, sql`true`)
    .leftJoin(classes, and(eq(classes.tenantId, students.tenantId), eq(classes.id, latest.classId)))
    .leftJoin(
      academicYears,
      and(
        eq(academicYears.tenantId, students.tenantId),
        eq(academicYears.id, latest.academicYearId),
      ),
    )
    .leftJoin(users, and(eq(users.tenantId, students.tenantId), eq(users.id, students.userId)))
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${students.fullName})`), students.studentNumber)
    .limit(1000);
  return rows.map(({ accountStatus, portalPasswordEncrypted, ...r }) => ({
    ...r,
    password: r.username ? decryptPortalPassword(portalPasswordEncrypted, r.id) : null,
    access: !r.username ? "none" : accountStatus === "active" ? "active" : "disabled",
  }));
}

export type PortalCredential = {
  studentId: string;
  fullName: string;
  studentNumber: string;
  className: string | null;
  username: string;
  password: string;
};

async function revokeSessions(tx: Transaction, userId: string, reason: string) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Give portal access to Active students who do not have a login yet. Returns
 * each new login with its password, once, for printing.
 */
export async function givePortalAccess(
  ctx: TenantContext,
  input: unknown,
): Promise<{ created: PortalCredential[]; skipped: number }> {
  assertCanManage(ctx);
  const { studentIds } = parseInput(portalStudentIdsSchema, input);
  const db = getDb();
  const [school] = await db
    .select({ code: tenants.schoolCode })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId));
  const latest = latestEnrollment();
  const chosen = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      studentNumber: students.studentNumber,
      status: students.status,
      userId: students.userId,
      className: classes.name,
    })
    .from(students)
    .leftJoinLateral(latest, sql`true`)
    .leftJoin(classes, and(eq(classes.tenantId, students.tenantId), eq(classes.id, latest.classId)))
    .where(and(eq(students.tenantId, ctx.tenantId), inArray(students.id, studentIds)));
  if (chosen.length !== new Set(studentIds).size) throw new NotFoundError();
  const eligible = chosen.filter((s) => s.status === "active" && !s.userId);

  // Hash outside the transaction (it is slow on purpose).
  const prepared = await Promise.all(
    eligible.map(async (s) => ({ ...s, ...(await preparePortalPassword()) })),
  );
  try {
    const created = await db.transaction(async (tx) => {
      const out: PortalCredential[] = [];
      for (const s of prepared) {
        const username = await insertPortalLogin(tx, ctx.tenantId, school.code, s);
        out.push({
          studentId: s.id,
          fullName: s.fullName,
          studentNumber: s.studentNumber,
          className: s.className,
          username,
          password: s.password,
        });
      }
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "portal.access_given",
          entityType: "student",
          after: {
            students: out.map((c) => ({ studentNumber: c.studentNumber, username: c.username })),
          },
        },
        tx,
      );
      return out;
    });
    return { created, skipped: chosen.length - created.length };
  } catch (error) {
    if (isUniqueViolation(error, "users_username_unique")) {
      throw new ConflictError("A portal login with one of these usernames already exists.");
    }
    throw error;
  }
}

/** A new random password and its hash (hash outside transactions: it is slow on purpose). */
export async function preparePortalPassword() {
  const password = generatePassword();
  return { password, passwordHash: await hashPassword(password) };
}

/** Create a student's portal login and link it; returns the username. */
export async function insertPortalLogin(
  tx: Transaction,
  tenantId: string,
  schoolCode: string,
  s: {
    id: string;
    fullName: string;
    studentNumber: string;
    password: string;
    passwordHash: string;
  },
): Promise<string> {
  const username = portalUsername(schoolCode, s.studentNumber);
  const [user] = await tx
    .insert(users)
    .values({
      tenantId,
      username,
      fullName: s.fullName,
      passwordHash: s.passwordHash,
      status: "active",
      passwordChangedAt: new Date(),
    })
    .returning({ id: users.id });
  await tx
    .update(students)
    .set({ userId: user.id, portalPasswordEncrypted: encryptPortalPassword(s.password, s.id) })
    .where(and(eq(students.tenantId, tenantId), eq(students.id, s.id)));
  return username;
}

/**
 * Passwords are generated automatically (product owner, 2026-10-21): every
 * Active student without a portal login gets one. Run when the Students
 * Portal page opens; returns how many were created.
 */
export async function ensurePortalLogins(ctx: TenantContext): Promise<number> {
  assertCanManage(ctx);
  const missing = await getDb()
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.tenantId, ctx.tenantId),
        eq(students.status, "active"),
        isNull(students.userId),
      ),
    )
    .limit(500);
  if (missing.length === 0) return 0;
  const { created } = await givePortalAccess(ctx, { studentIds: missing.map((s) => s.id) });
  return created.length;
}

async function findLinkedStudent(tx: Transaction, ctx: TenantContext, studentId: string) {
  const [row] = await tx
    .select({
      id: students.id,
      fullName: students.fullName,
      studentNumber: students.studentNumber,
      status: students.status,
      userId: students.userId,
      username: users.username,
    })
    .from(students)
    .leftJoin(users, and(eq(users.tenantId, students.tenantId), eq(users.id, students.userId)))
    .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, studentId)))
    .for("update", { of: students });
  if (!row) throw new NotFoundError();
  if (!row.userId || !row.username) {
    throw new InvalidStateError(`${row.fullName} has no portal login yet.`);
  }
  return row as typeof row & { userId: string; username: string };
}

/** Give a student a new random password and sign them out everywhere. */
export async function resetPortalPassword(
  ctx: TenantContext,
  studentId: string,
): Promise<{ fullName: string; studentNumber: string; username: string; password: string }> {
  assertCanManage(ctx);
  const id = parseId(studentId);
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  return getDb().transaction(async (tx) => {
    const student = await findLinkedStudent(tx, ctx, id);
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, student.userId)));
    await tx
      .update(students)
      .set({ portalPasswordEncrypted: encryptPortalPassword(password, id) })
      .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, id)));
    await revokeSessions(tx, student.userId, "password_reset_by_school");
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "portal.password_reset",
        entityType: "student",
        entityId: id,
        after: { username: student.username },
      },
      tx,
    );
    return {
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      username: student.username,
      password,
    };
  });
}

/** Turn a student's portal login off (signs them out) or on again. */
export async function setPortalAccess(
  ctx: TenantContext,
  studentId: string,
  enabled: boolean,
): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(studentId);
  await getDb().transaction(async (tx) => {
    const student = await findLinkedStudent(tx, ctx, id);
    if (enabled && student.status !== "active") {
      throw new InvalidStateError(
        `${student.fullName} is not an Active student, so the portal login stays off.`,
      );
    }
    await tx
      .update(users)
      .set({ status: enabled ? "active" : "disabled" })
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, student.userId)));
    if (!enabled) await revokeSessions(tx, student.userId, "portal_access_turned_off");
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: enabled ? "portal.access_enabled" : "portal.access_disabled",
        entityType: "student",
        entityId: id,
        after: { username: student.username },
      },
      tx,
    );
  });
}

/** Keep a student's portal login in step with their status (only Active may sign in). */
export async function syncPortalLogin(
  tx: Transaction,
  tenantId: string,
  student: { userId: string | null; status: string },
) {
  if (!student.userId || student.status === "active") return;
  await tx
    .update(users)
    .set({ status: "disabled" })
    .where(and(eq(users.tenantId, tenantId), eq(users.id, student.userId)));
  await revokeSessions(tx, student.userId, `student_${student.status}`);
}

// ----------------------------------------------------------------- portal

export type PortalStudent = {
  id: string;
  tenantId: string;
  studentNumber: string;
  fullName: string;
};

/** The student a signed-in user is, when their login is a Students Portal login. */
export async function findPortalStudent(user: SessionUser): Promise<PortalStudent | null> {
  if (!user.tenantId) return null;
  const [row] = await getDb()
    .select({
      id: students.id,
      tenantId: students.tenantId,
      studentNumber: students.studentNumber,
      fullName: students.fullName,
    })
    .from(students)
    .where(and(eq(students.tenantId, user.tenantId), eq(students.userId, user.id)));
  return row ?? null;
}

/**
 * A signed-in student changes their own 6-digit password after giving the
 * current one; the school still sees the new one. Their other sessions are
 * signed out; this one stays signed in.
 */
export async function changeOwnPassword(user: SessionUser, input: unknown): Promise<void> {
  const data = parseInput(changePasswordSchema, input);
  const student = await findPortalStudent(user);
  if (!student) throw new NotFoundError();
  const db = getDb();
  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id));
  if (!account || !(await verifyPassword(account.passwordHash, data.currentPassword))) {
    throw new ValidationError(undefined, { currentPassword: ["The current password is wrong."] });
  }
  const passwordHash = await hashPassword(data.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx
      .update(students)
      .set({ portalPasswordEncrypted: encryptPortalPassword(data.newPassword, student.id) })
      .where(and(eq(students.tenantId, student.tenantId), eq(students.id, student.id)));
    await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: "password_changed" })
      .where(
        and(
          eq(sessions.userId, user.id),
          isNull(sessions.revokedAt),
          ne(sessions.id, user.sessionId),
        ),
      );
    await recordAudit(
      {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "user.password_changed",
        entityType: "user",
        entityId: user.id,
      },
      tx,
    );
  });
}

export type PortalProfile = {
  id: string;
  studentNumber: string;
  fullName: string;
  gender: "male" | "female";
  dateOfBirth: string;
  admissionDate: string;
  guardianName: string;
  guardianPhone: string;
  phone: string | null;
  address: string | null;
  status: "active" | "graduated" | "transferred" | "left";
  className: string | null;
  academicYearName: string | null;
  photoVersion: number | null;
};

/** The signed-in student's own details (portal only). */
export async function getPortalProfile(student: PortalStudent): Promise<PortalProfile> {
  const latest = latestEnrollment();
  const [row] = await getDb()
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      fullName: students.fullName,
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      admissionDate: students.admissionDate,
      guardianName: students.guardianName,
      guardianPhone: students.guardianPhone,
      phone: students.phone,
      address: students.address,
      status: students.status,
      className: classes.name,
      academicYearName: academicYears.name,
      photoUpdatedAt: studentPhotos.updatedAt,
    })
    .from(students)
    .leftJoinLateral(latest, sql`true`)
    .leftJoin(classes, and(eq(classes.tenantId, students.tenantId), eq(classes.id, latest.classId)))
    .leftJoin(
      academicYears,
      and(
        eq(academicYears.tenantId, students.tenantId),
        eq(academicYears.id, latest.academicYearId),
      ),
    )
    .leftJoin(
      studentPhotos,
      and(eq(studentPhotos.tenantId, students.tenantId), eq(studentPhotos.studentId, students.id)),
    )
    .where(and(eq(students.tenantId, student.tenantId), eq(students.id, student.id)));
  if (!row) throw new NotFoundError();
  const { photoUpdatedAt, ...rest } = row;
  return { ...rest, photoVersion: photoUpdatedAt ? photoUpdatedAt.getTime() : null };
}

/** The classes the signed-in student was placed in, newest year first (portal only). */
export async function getPortalEnrollments(student: PortalStudent) {
  return getDb()
    .select({
      academicYearId: studentEnrollments.academicYearId,
      academicYearName: academicYears.name,
      academicYearStatus: academicYears.status,
      classId: studentEnrollments.classId,
      className: classes.name,
    })
    .from(studentEnrollments)
    .innerJoin(
      academicYears,
      and(
        eq(academicYears.tenantId, studentEnrollments.tenantId),
        eq(academicYears.id, studentEnrollments.academicYearId),
      ),
    )
    .innerJoin(
      classes,
      and(
        eq(classes.tenantId, studentEnrollments.tenantId),
        eq(classes.id, studentEnrollments.classId),
      ),
    )
    .where(
      and(
        eq(studentEnrollments.tenantId, student.tenantId),
        eq(studentEnrollments.studentId, student.id),
      ),
    )
    .orderBy(desc(studentEnrollments.createdAt));
}
