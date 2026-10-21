// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, workTypes } from "@/db/schema";
import * as yearRepo from "@/features/academic-years/repository";
import * as classRepo from "@/features/classes/repository";
import * as examRepo from "@/features/exams/repository";
import * as staffRepo from "@/features/staff/repository";
import * as studentRepo from "@/features/students/repository";
import * as subjectRepo from "@/features/subjects/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/*
 * Examinations: per class and subject, each student's Midterm (30),
 * Activities (20) and Final (50); results with total, average and Pass/Fail.
 */
describe.skipIf(!hasDatabase)("examinations", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let teacherA: ReturnType<typeof createTenantContext>;
  const ids: Record<string, string> = {};

  const where = (classKey: string, subjectKey: string) => ({
    academicYearId: ids.year,
    classId: ids[classKey],
    subjectId: ids[subjectKey],
  });
  const save = (
    ctx: ReturnType<typeof createTenantContext>,
    classKey: string,
    subjectKey: string,
    entries: [string, string, string, string][],
  ) =>
    examRepo.saveSubjectMarks(ctx, where(classKey, subjectKey), {
      entries: entries.map(([student, midterm, activities, final]) => ({
        studentId: ids[student],
        midterm,
        activities,
        final,
      })),
    });

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `EX-${run}-${code}`,
      name: `Exams ${code}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const a = await tenantRepo.registerSchool(platform, school("A"));
    const b = await tenantRepo.registerSchool(platform, school("B"));
    tenantIds.push(a.id, b.id);
    // Staff logins need an approved school.
    await tenantRepo.changeSchoolStatus(platform, a.id, { action: "approve" });
    adminA = createTenantContext({ tenantId: a.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: b.id, branchScope: "all", permissions: "all" });

    ids.year = (
      await yearRepo.createAcademicYear(adminA, { name: "2026–2027", status: "current" })
    ).id;
    ids.form1 = (await classRepo.createClass(adminA, { name: "Form 1", seats: "40" })).id;
    ids.form2 = (await classRepo.createClass(adminA, { name: "Form 2", seats: "40" })).id;
    ids.math = (await subjectRepo.createSubject(adminA, { name: "Mathematics" })).id;
    ids.english = (await subjectRepo.createSubject(adminA, { name: "English" })).id;
    const student = async (name: string, classId: string) =>
      (
        await studentRepo.createStudent(adminA, {
          fullName: name,
          gender: "female",
          dateOfBirth: "2012-01-01",
          classId,
          academicYearId: ids.year,
          admissionDate: "2020-01-01",
          guardianName: "Guardian",
          guardianPhone: "+252 61 000 0000",
          feeType: "full_scholarship",
          registrationFee: "0",
        })
      ).id;
    ids.amina = await student("Amina", ids.form1);
    ids.bashir = await student("Bashir", ids.form1);
    ids.cali = await student("Cali", ids.form2);

    // A teacher with a login who teaches Mathematics.
    const [teacherType] = await getDb()
      .select({ id: workTypes.id })
      .from(workTypes)
      .where(and(eq(workTypes.tenantId, a.id), eq(workTypes.name, "Teacher")));
    const teacher = await staffRepo.createStaff(
      adminA,
      {
        fullName: "Hodan Teacher",
        workTypeId: teacherType.id,
        gender: "female",
        dateOfBirth: "1990-01-01",
        phone: "+252 61 111 1111",
        location: "Hodan",
        hireDate: "2020-01-01",
      },
      null,
      { username: `hodan.${run.toLowerCase()}`, password: "Teacher-Passw0rd!" },
    );
    await subjectRepo.assignSubjectTeacher(adminA, ids.math, { staffId: teacher.id });
    teacherA = createTenantContext({
      tenantId: a.id,
      branchScope: "all",
      actorUserId: teacher.userId!,
      permissions: ["exams.read", "exams.enter_marks"],
    });
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("lists the students of the chosen class with empty marks", async () => {
    const sheet = await examRepo.getSubjectMarks(adminA, where("form1", "math"));
    expect(sheet).toMatchObject({ className: "Form 1", subjectName: "Mathematics" });
    expect(sheet.rows.map((r) => [r.fullName, r.midterm, r.activities, r.final])).toEqual([
      ["Amina", null, null, null],
      ["Bashir", null, null, null],
    ]);
  });

  it("saves Midterm, Activities and Final within their maximums", async () => {
    await expect(
      save(adminA, "form1", "math", [["amina", "31", "21", "51"]]),
    ).rejects.toMatchObject({
      fieldErrors: {
        [`midterm:${ids.amina}`]: ["Use at most 30."],
        [`activities:${ids.amina}`]: ["Use at most 20."],
        [`final:${ids.amina}`]: ["Use at most 50."],
      },
    });
    // A student of another class cannot be marked here.
    await expect(save(adminA, "form1", "math", [["cali", "1", "1", "1"]])).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    expect(
      await save(adminA, "form1", "math", [
        ["amina", "25.5", "18", "46.5"],
        ["bashir", "10", "", "20"],
      ]),
    ).toEqual({ saved: 2, cleared: 0 });
    const sheet = await examRepo.getSubjectMarks(adminA, where("form1", "math"));
    expect(sheet.rows.map((r) => [r.midterm, r.activities, r.final])).toEqual([
      ["25.5", "18", "46.5"],
      ["10", null, "20"],
    ]);
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, ids.math), eq(auditLogs.action, "exam.marks_saved")));
    expect(entry.afterData).toMatchObject({ subject: "Mathematics", className: "Form 1" });
    expect(await examRepo.countMarkedBySubject(adminA, where("form1", "math"))).toEqual({
      students: 2,
      marked: { [ids.math]: 2 },
    });
  });

  it("shows totals, the average and Pass/Fail", async () => {
    await save(adminA, "form1", "english", [
      ["amina", "20", "15", "40"],
      ["bashir", "15", "10", "24.9"],
    ]);
    const results = await examRepo.getClassResults(adminA, {
      academicYearId: ids.year,
      classId: ids.form1,
    });
    expect(results.subjects.map((s) => s.name)).toEqual(["English", "Mathematics"]);
    expect(
      results.rows.map((r) => [
        r.fullName,
        r.totals[ids.math],
        r.totals[ids.english],
        r.total,
        r.average,
        r.result,
      ]),
    ).toEqual([
      // Math 90 + English 75 = 165 → 82.5
      ["Amina", "90", "75", "165", "82.5", "pass"],
      // Math 30 + English 49.9 = 79.9 → 39.95, shown 39.9
      ["Bashir", "30", "49.9", "79.9", "39.9", "fail"],
    ]);
  });

  it("removes a student's marks when all three boxes are emptied", async () => {
    expect(await save(adminA, "form1", "english", [["bashir", "", "", ""]])).toEqual({
      saved: 0,
      cleared: 1,
    });
    const results = await examRepo.getClassResults(adminA, {
      academicYearId: ids.year,
      classId: ids.form1,
    });
    // Missing English counts as 0: (30 + 0) / 2 = 15.
    expect(results.rows[1]).toMatchObject({ average: "15.0", result: "fail", missing: 1 });
  });

  it("lets a teacher enter marks only for the subjects they teach", async () => {
    const choices = await examRepo.getExamChoices(teacherA);
    expect(choices.subjects.map((s) => [s.name, s.canEnter])).toEqual([
      ["English", false],
      ["Mathematics", true],
    ]);
    await save(teacherA, "form1", "math", [["bashir", "12", "5", "20"]]);
    await expect(
      save(teacherA, "form1", "english", [["bashir", "1", "1", "1"]]),
    ).rejects.toMatchObject({ message: "You can enter marks only for the subjects you teach." });
    const viewer = createTenantContext({
      tenantId: adminA.tenantId,
      branchScope: "all",
      permissions: ["exams.read"],
    });
    await expect(save(viewer, "form1", "math", [["bashir", "1", "1", "1"]])).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
  });

  it("shows one student's result with position and neighbours", async () => {
    const target = { academicYearId: ids.year, classId: ids.form1 };
    const amina = await examRepo.getStudentResult(adminA, { ...target, studentId: ids.amina });
    expect(amina).toMatchObject({
      student: { fullName: "Amina" },
      className: "Form 1",
      total: "165",
      maxTotal: 200,
      average: "82.5",
      result: "pass",
      position: 1,
      classSize: 2,
      previous: null,
      next: { fullName: "Bashir" },
    });
    expect(amina.subjects.map((s) => [s.name, s.midterm, s.activities, s.final, s.total])).toEqual([
      ["English", "20", "15", "40", "75"],
      ["Mathematics", "25.5", "18", "46.5", "90"],
    ]);
    const bashir = await examRepo.getStudentResult(adminA, { ...target, studentId: ids.bashir });
    expect(bashir).toMatchObject({ position: 2, previous: { fullName: "Amina" }, next: null });
    // Only students of the class have a result there.
    await expect(
      examRepo.getStudentResult(adminA, { ...target, studentId: ids.cali }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
  });

  it("saves one student's marks in several subjects", async () => {
    const target = { academicYearId: ids.year, classId: ids.form1, studentId: ids.bashir };
    await expect(
      examRepo.saveStudentMarks(adminA, target, {
        entries: [{ subjectId: ids.english, midterm: "10", activities: "10", final: "51" }],
      }),
    ).rejects.toMatchObject({ fieldErrors: { [`final:${ids.english}`]: ["Use at most 50."] } });
    expect(
      await examRepo.saveStudentMarks(adminA, target, {
        entries: [
          { subjectId: ids.english, midterm: "20", activities: "10", final: "30" },
          { subjectId: ids.math, midterm: "20", activities: "10", final: "30" },
        ],
      }),
    ).toEqual({ saved: 2, cleared: 0 });
    expect(await examRepo.getStudentResult(adminA, target)).toMatchObject({
      total: "120",
      average: "60.0",
      result: "pass",
    });

    // A teacher may save only the subjects they teach.
    await examRepo.saveStudentMarks(teacherA, target, {
      entries: [{ subjectId: ids.math, midterm: "12", activities: "5", final: "20" }],
    });
    await expect(
      examRepo.saveStudentMarks(teacherA, target, {
        entries: [{ subjectId: ids.english, midterm: "1", activities: "1", final: "1" }],
      }),
    ).rejects.toMatchObject({
      message: "You can enter marks only for the subjects you teach (not English).",
    });
    // Back to the marks the next tests expect: English cleared for Bashir.
    expect(
      await examRepo.saveStudentMarks(adminA, target, {
        entries: [{ subjectId: ids.english, midterm: "", activities: "", final: "" }],
      }),
    ).toEqual({ saved: 0, cleared: 1 });
  });

  it("keeps marked students, classes, subjects and years from being deleted", async () => {
    await expect(studentRepo.deleteStudent(adminA, ids.amina)).rejects.toMatchObject({
      message:
        "This student has exam marks on record and cannot be deleted. Change the status instead.",
    });
    await expect(subjectRepo.deleteSubject(adminA, ids.math)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
    await expect(classRepo.deleteClass(adminA, ids.form1)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
    await expect(yearRepo.deleteAcademicYear(adminA, ids.year)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
  });

  it("counts every Active subject, even without marks, in the total and average", async () => {
    await subjectRepo.createSubject(adminA, { name: "Science" });
    await subjectRepo.createSubject(adminA, { name: "Old Art", status: "inactive" });
    const results = await examRepo.getClassResults(adminA, {
      academicYearId: ids.year,
      classId: ids.form1,
    });
    // The inactive subject without marks does not count.
    expect(results.subjects.map((s) => s.name)).toEqual(["English", "Mathematics", "Science"]);
    // Amina: Math 90 + English 75 + Science 0 = 165 over 3 subjects → 55.0, a Pass.
    expect(results.rows[0]).toMatchObject({
      fullName: "Amina",
      total: "165",
      average: "55.0",
      result: "pass",
      missing: 1,
    });
  });

  it("never shows or changes another school's marks", async () => {
    await expect(examRepo.getSubjectMarks(adminB, where("form1", "math"))).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await expect(save(adminB, "form1", "math", [["amina", "1", "1", "1"]])).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await expect(
      examRepo.getClassResults(adminB, { academicYearId: ids.year, classId: ids.form1 }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
  });
});
