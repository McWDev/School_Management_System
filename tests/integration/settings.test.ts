// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, feePayments, workTypes } from "@/db/schema";
import * as yearRepo from "@/features/academic-years/repository";
import * as classRepo from "@/features/classes/repository";
import * as examRepo from "@/features/exams/repository";
import * as payrollRepo from "@/features/payroll/repository";
import * as settingsRepo from "@/features/settings/repository";
import * as staffRepo from "@/features/staff/repository";
import * as studentRepo from "@/features/students/repository";
import * as subjectRepo from "@/features/subjects/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/* General Settings: exam rules and number prefixes, per school. */
describe.skipIf(!hasDatabase)("general settings", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;
  const ids: Record<string, string> = {};

  const settings = (over: Record<string, string> = {}) => ({
    passMark: "50",
    midtermMax: "30",
    activitiesMax: "20",
    finalMax: "50",
    studentPrefix: "STU",
    receiptPrefix: "RCT",
    payslipPrefix: "PAY",
    ...over,
  });
  const student = (fullName: string, over: Record<string, unknown> = {}) =>
    studentRepo.createStudent(adminA, {
      fullName,
      gender: "female",
      dateOfBirth: "2012-01-01",
      classId: ids.form1,
      academicYearId: ids.year,
      admissionDate: "2020-01-01",
      guardianName: "Guardian",
      guardianPhone: "+252 61 000 0000",
      feeType: "full_scholarship",
      registrationFee: "0",
      ...over,
    });
  const mark = (midterm: string, activities: string, final: string) =>
    examRepo.saveSubjectMarks(
      adminA,
      { academicYearId: ids.year, classId: ids.form1, subjectId: ids.math },
      { entries: [{ studentId: ids.amina, midterm, activities, final }] },
    );

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `SE-${run}-${code}`,
      name: `Settings ${code}`,
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
      permissions: ["exams.read"],
    });
    ids.year = (
      await yearRepo.createAcademicYear(adminA, { name: "2026–2027", status: "current" })
    ).id;
    ids.form1 = (await classRepo.createClass(adminA, { name: "Form 1", seats: "40" })).id;
    ids.math = (await subjectRepo.createSubject(adminA, { name: "Mathematics" })).id;
    ids.amina = (await student("Amina")).id;
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("starts from the defaults", async () => {
    expect(await settingsRepo.getGeneralSettings(adminA)).toEqual({
      passMark: 50,
      midtermMax: 30,
      activitiesMax: 20,
      finalMax: 50,
      studentPrefix: "STU",
      receiptPrefix: "RCT",
      payslipPrefix: "PAY",
    });
  });

  it("needs the parts to add up to 100 and never below an entered mark", async () => {
    await expect(
      settingsRepo.updateGeneralSettings(adminA, settings({ finalMax: "40" })),
    ).rejects.toBeInstanceOf(errors.ValidationError);
    await mark("28", "15", "45");
    await expect(
      settingsRepo.updateGeneralSettings(
        adminA,
        settings({ midtermMax: "25", activitiesMax: "25", finalMax: "50" }),
      ),
    ).rejects.toMatchObject({
      fieldErrors: {
        midtermMax: ["A Midterm mark of 28 is already entered; the maximum cannot be lower."],
      },
    });
  });

  it("applies new exam rules to marks and to Pass/Fail", async () => {
    // Amina: 28 + 15 + 45 = 88 → passes at 50.
    const before = await examRepo.getClassResults(adminA, {
      academicYearId: ids.year,
      classId: ids.form1,
    });
    expect(before.rows[0]).toMatchObject({ average: "88.0", result: "pass" });

    await settingsRepo.updateGeneralSettings(
      adminA,
      settings({ passMark: "90", midtermMax: "30", activitiesMax: "15", finalMax: "55" }),
    );
    const after = await examRepo.getClassResults(adminA, {
      academicYearId: ids.year,
      classId: ids.form1,
    });
    expect(after.rules).toMatchObject({ passMark: 90 });
    expect(after.rows[0]).toMatchObject({ average: "88.0", result: "fail" });
    // Activities is now out of 15, Final out of 55.
    await expect(mark("28", "16", "45")).rejects.toMatchObject({
      fieldErrors: { [`activities:${ids.amina}`]: ["Use at most 15."] },
    });
    await mark("28", "15", "55");
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, adminA.tenantId),
          eq(auditLogs.action, "settings.general_updated"),
        ),
      );
    expect(entry.afterData).toMatchObject({ passMark: 90 });
  });

  it("uses new prefixes for new numbers only", async () => {
    await settingsRepo.updateGeneralSettings(
      adminA,
      settings({
        // The exam rules stay as set above (a Final mark of 55 is entered).
        passMark: "90",
        activitiesMax: "15",
        finalMax: "55",
        studentPrefix: "hds",
        receiptPrefix: "REC",
        payslipPrefix: "SAL",
      }),
    );
    // Student numbers continue: the second student of the school.
    const bashir = await student("Bashir", {
      feeType: "full_payment",
      feeAmount: "10",
      registrationFee: "5",
      registrationFeePaid: true,
    });
    expect(bashir.studentNumber).toBe("HDS-0002");
    const [amina] = (await studentRepo.listStudents(adminA, { search: "Amina" })).items;
    expect(amina.studentNumber).toBe("STU-0001");
    const [payment] = await getDb()
      .select()
      .from(feePayments)
      .where(eq(feePayments.studentId, bashir.id));
    expect(payment.receiptNumber).toBe("REC-000001");

    const [teacherType] = await getDb()
      .select({ id: workTypes.id })
      .from(workTypes)
      .where(and(eq(workTypes.tenantId, adminA.tenantId), eq(workTypes.name, "Teacher")));
    const teacher = await staffRepo.createStaff(adminA, {
      fullName: "Hodan Teacher",
      workTypeId: teacherType.id,
      gender: "female",
      dateOfBirth: "1990-01-01",
      phone: "+252 61 111 1111",
      location: "Hodan",
      hireDate: "2020-01-01",
      salary: "300",
    });
    const slip = await payrollRepo.paySalary(adminA, "2025-10", {
      staffId: teacher.id,
      amount: "300",
      paymentDate: "2025-10-28",
      method: "cash",
      bonus: "",
      deduction: "",
    });
    expect(slip.payslipNumber).toBe("SAL-000001");
  });

  it("checks permissions and keeps schools apart", async () => {
    await expect(settingsRepo.getGeneralSettings(viewerA)).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
    await expect(settingsRepo.updateGeneralSettings(viewerA, settings())).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
    expect(await settingsRepo.getGeneralSettings(adminB)).toMatchObject({
      passMark: 50,
      studentPrefix: "STU",
    });
  });
});
