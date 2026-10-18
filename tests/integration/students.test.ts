// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs } from "@/db/schema";
import * as yearRepo from "@/features/academic-years/repository";
import * as classRepo from "@/features/classes/repository";
import * as studentRepo from "@/features/students/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/*
 * Students: automatic Student IDs, class seats per academic year, duplicate
 * warning, status permission, delete guards and school isolation.
 */
describe.skipIf(!hasDatabase)("students", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;
  let editorA: ReturnType<typeof createTenantContext>;
  let smallClass: string;
  let bigClass: string;
  let inactiveClass: string;
  let currentYear: string;
  let nextYear: string;
  let closedYear: string;

  const base = () => ({
    gender: "female",
    dateOfBirth: "2014-03-02",
    classId: smallClass,
    academicYearId: currentYear,
    admissionDate: "2020-09-01",
    guardianName: "Guardian",
    guardianPhone: "+252 61 000 0000",
    feeType: "full_payment",
    feeAmount: "50",
    registrationFee: "20",
  });
  const byName = async (name: string) =>
    (await studentRepo.listStudents(adminA, { search: name })).items.find(
      (s) => s.fullName === name,
    )!;

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `ST-${run}-${code}`,
      name: `Students ${code}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const a = await tenantRepo.registerSchool(platform, school("A"));
    const b = await tenantRepo.registerSchool(platform, school("B"));
    tenantIds.push(a.id, b.id);
    adminA = createTenantContext({ tenantId: a.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: b.id, branchScope: "all", permissions: "all" });
    viewerA = createTenantContext({
      tenantId: a.id,
      branchScope: "all",
      permissions: ["students.read"],
    });
    editorA = createTenantContext({
      tenantId: a.id,
      branchScope: "all",
      permissions: ["students.read", "students.update"],
    });
    smallClass = (await classRepo.createClass(adminA, { name: "Small", seats: "2" })).id;
    bigClass = (await classRepo.createClass(adminA, { name: "Big", seats: "40" })).id;
    inactiveClass = (
      await classRepo.createClass(adminA, { name: "Old", seats: "10", status: "inactive" })
    ).id;
    currentYear = (
      await yearRepo.createAcademicYear(adminA, { name: "2026–2027", status: "current" })
    ).id;
    nextYear = (await yearRepo.createAcademicYear(adminA, { name: "2027–2028" })).id;
    closedYear = (
      await yearRepo.createAcademicYear(adminA, { name: "2025–2026", status: "closed" })
    ).id;
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("registers students with automatic Student IDs and their class, audited", async () => {
    const first = await studentRepo.createStudent(adminA, { ...base(), fullName: "Amina One" });
    const second = await studentRepo.createStudent(adminA, {
      ...base(),
      fullName: "Bashir Two",
      dateOfBirth: "2013-01-01",
    });
    expect([first.studentNumber, second.studentNumber]).toEqual(["STU-0001", "STU-0002"]);
    expect(first.status).toBe("active");

    const listed = await byName("Amina One");
    expect(listed).toMatchObject({
      className: "Small",
      academicYearName: "2026–2027",
      guardianName: "Guardian",
    });
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, first.id), eq(auditLogs.action, "student.created")));
    expect(entry.afterData).toMatchObject({ studentNumber: "STU-0001", className: "Small" });
  });

  it("stores the fee type and registration fee exactly, hidden from view-only users", async () => {
    const created = await studentRepo.createStudent(adminA, {
      ...base(),
      fullName: "Fee Partial",
      classId: bigClass,
      feeType: "partial_fee",
      feeAmount: "15.50",
      registrationFee: "1234.5",
      registrationFeePaid: true,
    });
    expect(created).toMatchObject({
      feeType: "partial_fee",
      feeAmount: "15.50",
      registrationFee: "1234.50",
      registrationFeePaid: true,
    });
    expect((await byName("Fee Partial")).fees).toMatchObject({ registrationFee: "1234.50" });
    const asViewer = (await studentRepo.listStudents(viewerA, { search: "Fee Partial" })).items[0];
    expect(asViewer.fees).toBeNull();
    expect(asViewer).not.toHaveProperty("registrationFee");
    await studentRepo.deleteStudent(adminA, created.id);
  });

  it("never lets a class hold more Active students than its seats", async () => {
    // Small has 2 seats, both taken.
    const full = studentRepo.createStudent(adminA, { ...base(), fullName: "Cali Three" });
    await expect(full).rejects.toBeInstanceOf(errors.ValidationError);
    await expect(full).rejects.toMatchObject({
      fieldErrors: { classId: ["Small is full: all 2 seats are taken in 2026–2027."] },
    });
    // Seats are counted per academic year.
    await studentRepo.createStudent(adminA, {
      ...base(),
      fullName: "Cali Three",
      academicYearId: nextYear,
    });
    // Seats cannot be reduced below the Active students in the class.
    await expect(
      classRepo.updateClass(adminA, smallClass, { name: "Small", seats: "1" }),
    ).rejects.toMatchObject({
      fieldErrors: { seats: ["Small has 2 Active students. Seats cannot be fewer than 2."] },
    });
  });

  it("frees the seat when a student is no longer Active", async () => {
    const amina = await byName("Amina One");
    await studentRepo.updateStudent(adminA, amina.id, {
      ...base(),
      fullName: "Amina One",
      status: "graduated",
    });
    await studentRepo.createStudent(adminA, {
      ...base(),
      fullName: "Dahir Four",
      dateOfBirth: "2012-05-05",
    });
    // Making Amina Active again would overfill the class.
    await expect(
      studentRepo.updateStudent(adminA, amina.id, {
        ...base(),
        fullName: "Amina One",
        status: "active",
      }),
    ).rejects.toBeInstanceOf(errors.ValidationError);
  });

  it("refuses Inactive classes and Closed years for new placements", async () => {
    await expect(
      studentRepo.createStudent(adminA, { ...base(), fullName: "Eid", classId: inactiveClass }),
    ).rejects.toMatchObject({
      fieldErrors: { classId: ["Old is Inactive. Choose an Active class."] },
    });
    await expect(
      studentRepo.createStudent(adminA, {
        ...base(),
        fullName: "Eid",
        classId: bigClass,
        academicYearId: closedYear,
      }),
    ).rejects.toMatchObject({
      fieldErrors: {
        academicYearId: ["2025–2026 is Closed. Choose the Current or an Upcoming year."],
      },
    });
  });

  it("warns about a possible duplicate until confirmed", async () => {
    const twin = {
      ...base(),
      fullName: "bashir two",
      dateOfBirth: "2013-01-01",
      classId: bigClass,
    };
    await expect(studentRepo.createStudent(adminA, twin)).rejects.toMatchObject({
      fieldErrors: {
        duplicate: [
          "A student named bashir two with the same date of birth is already registered (STU-0002).",
        ],
      },
    });
    const created = await studentRepo.createStudent(adminA, twin, { confirmDuplicate: true });
    expect(created.studentNumber).toBe("STU-0006");
  });

  it("moves a student to another class and keeps one placement", async () => {
    const bashir = await byName("Bashir Two");
    await studentRepo.updateStudent(adminA, bashir.id, {
      ...base(),
      fullName: "Bashir Two",
      dateOfBirth: "2013-01-01",
      classId: bigClass,
      academicYearId: nextYear,
    });
    expect(await byName("Bashir Two")).toMatchObject({
      className: "Big",
      academicYearName: "2027–2028",
    });
    const inBig = await studentRepo.listStudents(adminA, { classId: bigClass });
    expect(inBig.items.map((s) => s.fullName).sort()).toEqual(["Bashir Two", "bashir two"]);
  });

  it("needs students.archive to change the status or delete", async () => {
    const dahir = await byName("Dahir Four");
    const input = { ...base(), fullName: "Dahir F.", dateOfBirth: "2012-05-05" };
    await studentRepo.updateStudent(editorA, dahir.id, input);
    await expect(
      studentRepo.updateStudent(editorA, dahir.id, { ...input, status: "left" }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(studentRepo.deleteStudent(editorA, dahir.id)).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
    await expect(
      studentRepo.createStudent(viewerA, { ...base(), fullName: "New" }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    expect((await studentRepo.listStudents(viewerA)).total).toBeGreaterThan(0);
  });

  it("keeps classes and years with students from being deleted", async () => {
    await expect(classRepo.deleteClass(adminA, bigClass)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
    await expect(yearRepo.deleteAcademicYear(adminA, nextYear)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
  });

  it("deletes a student, audited, and never reuses the Student ID", async () => {
    const eid = await studentRepo.createStudent(adminA, {
      ...base(),
      fullName: "Eid Seven",
      classId: bigClass,
    });
    await studentRepo.deleteStudent(adminA, eid.id);
    expect((await studentRepo.listStudents(adminA, { search: "Eid Seven" })).total).toBe(0);
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, eid.id), eq(auditLogs.action, "student.deleted")));
    expect(entry.beforeData).toMatchObject({ studentNumber: eid.studentNumber });
    const next = await studentRepo.createStudent(adminA, {
      ...base(),
      fullName: "Farah Eight",
      classId: bigClass,
    });
    expect(next.studentNumber).not.toBe(eid.studentNumber);
  });

  it("never shows or changes another school's students", async () => {
    expect((await studentRepo.listStudents(adminB)).total).toBe(0);
    const amina = await byName("Amina One");
    await expect(studentRepo.deleteStudent(adminB, amina.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    expect(await studentRepo.getStudentPhoto(adminB, amina.id)).toBeNull();
    // A class of school A cannot be used by school B.
    await expect(
      studentRepo.createStudent(adminB, { ...base(), fullName: "Cross" }),
    ).rejects.toBeInstanceOf(errors.ValidationError);
    // School B gets its own Student IDs from 1.
    const bClass = (await classRepo.createClass(adminB, { name: "B1", seats: "5" })).id;
    const bYear = (await yearRepo.createAcademicYear(adminB, { name: "Y", status: "current" })).id;
    const first = await studentRepo.createStudent(adminB, {
      ...base(),
      fullName: "B Student",
      classId: bClass,
      academicYearId: bYear,
    });
    expect(first.studentNumber).toBe("STU-0001");
  });
});
