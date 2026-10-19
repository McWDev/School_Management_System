// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, students } from "@/db/schema";
import * as yearRepo from "@/features/academic-years/repository";
import * as classRepo from "@/features/classes/repository";
import * as feeRepo from "@/features/fees/repository";
import * as studentRepo from "@/features/students/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/*
 * Student fees: registration fee, monthly charges, payments allocated to
 * charges, receipts, reversals, waivers, permissions and school isolation.
 */
describe.skipIf(!hasDatabase)("student fees", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;
  let classId: string;
  let yearId: string;
  const ids: Record<string, string> = {};
  // Months well in the past, so "today" never matters.
  const SEPT = "2025-09";
  const OCT = "2025-10";

  const register = async (name: string, fees: Record<string, unknown>) =>
    (
      await studentRepo.createStudent(adminA, {
        fullName: name,
        gender: "male",
        dateOfBirth: "2014-01-01",
        classId,
        academicYearId: yearId,
        admissionDate: "2025-08-15",
        guardianName: "Guardian",
        guardianPhone: "+252 61 000 0000",
        registrationFee: "0",
        ...fees,
      })
    ).id;
  const account = (key: string) => feeRepo.getStudentFeeAccount(adminA, ids[key]);
  const chargeOf = async (key: string, label: string) =>
    (await account(key)).charges.find((c) => c.label === label)!;
  const pay = (key: string, lines: { chargeId: string; amount: string }[]) =>
    feeRepo.recordPayment(adminA, {
      studentId: ids[key],
      paymentDate: "2025-10-05",
      method: "mobile_money",
      reference: "EVC-123",
      lines,
    });

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `FE-${run}-${code}`,
      name: `Fees ${code}`,
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
      permissions: ["fees.read"],
    });
    classId = (await classRepo.createClass(adminA, { name: "Form 1", seats: "40" })).id;
    yearId = (await yearRepo.createAcademicYear(adminA, { name: "2025–2026", status: "current" }))
      .id;
    ids.full = await register("Full Payer", {
      feeType: "full_payment",
      feeAmount: "50",
      registrationFee: "10",
      registrationFeePaid: true,
    });
    ids.partial = await register("Partial Payer", {
      feeType: "partial_fee",
      feeAmount: "20.50",
      registrationFee: "15",
    });
    ids.scholar = await register("Scholar", { feeType: "full_scholarship" });
    ids.left = await register("Left Student", { feeType: "full_payment", feeAmount: "30" });
    const left = await studentRepo.listStudents(adminA, { search: "Left Student" });
    await studentRepo.updateStudent(adminA, ids.left, {
      ...left.items[0],
      ...left.items[0].fees,
      classId,
      academicYearId: yearId,
      status: "left",
    });
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("charges the registration fee, and records it when paid at registration", async () => {
    const full = await account("full");
    expect(full.charges).toMatchObject([
      { label: "Registration fee", amount: "10.00", paid: "10.00", remaining: "0.00" },
    ]);
    expect(full.payments).toMatchObject([
      {
        receiptNumber: "RCT-000001",
        amount: "10.00",
        paymentDate: "2025-08-15",
        method: "cash",
        lines: [{ label: "Registration fee", amount: "10.00" }],
      },
    ]);
    const [row] = await getDb().select().from(students).where(eq(students.id, ids.full));
    expect(row.registrationFeePaid).toBe(true);
    expect((await account("partial")).balance).toBe("15.00");
    expect((await account("scholar")).charges).toEqual([]);
  });

  it("charges a month to Active fee-paying students only, once", async () => {
    const before = await feeRepo.getFeeSummary(adminA, SEPT);
    expect(before.toCharge).toEqual({ count: 2, total: "70.50" });
    expect(await feeRepo.chargeMonth(adminA, SEPT)).toEqual({
      month: "2025-09-01",
      charged: 2,
      total: "70.50",
    });
    // Running again charges nobody twice.
    expect((await feeRepo.chargeMonth(adminA, SEPT)).charged).toBe(0);
    await feeRepo.chargeMonth(adminA, OCT);
    expect((await account("full")).charges.map((c) => [c.label, c.amount])).toEqual([
      ["October 2025", "50.00"],
      ["September 2025", "50.00"],
      ["Registration fee", "10.00"],
    ]);
    expect((await account("scholar")).charges).toEqual([]);
    expect((await account("left")).charges).toEqual([]);
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.tenantId, adminA.tenantId), eq(auditLogs.action, "fee.month_charged")),
      );
    expect(entry.afterData).toMatchObject({ month: "2025-09-01", students: 2, total: "70.50" });
    // Months far ahead cannot be charged.
    await expect(feeRepo.chargeMonth(adminA, "2099-01")).rejects.toBeInstanceOf(
      errors.ValidationError,
    );
  });

  it("records full and part payments with receipts, never more than owed", async () => {
    const sept = await chargeOf("full", "September 2025");
    const oct = await chargeOf("full", "October 2025");
    const payment = await pay("full", [
      { chargeId: sept.id, amount: "50" },
      { chargeId: oct.id, amount: "20.25" },
    ]);
    expect(payment).toMatchObject({ receiptNumber: "RCT-000002", amount: "70.25" });
    expect(await chargeOf("full", "October 2025")).toMatchObject({
      paid: "20.25",
      remaining: "29.75",
    });
    await expect(pay("full", [{ chargeId: oct.id, amount: "29.76" }])).rejects.toMatchObject({
      message: "October 2025: only 29.75 is still owed.",
    });
    await expect(pay("full", [{ chargeId: sept.id, amount: "1" }])).rejects.toMatchObject({
      message: "September 2025 is already paid.",
    });
    // Another student's charge cannot be paid on this account.
    const other = await chargeOf("partial", "September 2025");
    await expect(pay("full", [{ chargeId: other.id, amount: "1" }])).rejects.toBeInstanceOf(
      errors.ValidationError,
    );
    expect((await account("full")).balance).toBe("29.75");

    const receipt = await feeRepo.getReceipt(adminA, payment.id);
    expect(receipt).toMatchObject({
      currencyCode: "USD",
      student: { fullName: "Full Payer", className: "Form 1" },
      lines: [
        { label: "September 2025", amount: "50.00" },
        { label: "October 2025", amount: "20.25" },
      ],
    });
  });

  it("sums the month and the balances list from real records", async () => {
    const summary = await feeRepo.getFeeSummary(adminA, OCT);
    // October charges: 50 + 20.50; collected in October: 70.25; owed: 29.75 + 15 + 20.50 + 20.50.
    expect(summary).toMatchObject({
      charged: "70.50",
      collected: "70.25",
      outstanding: "85.75",
      studentsOwing: 2,
      toCharge: { count: 0 },
    });
    const owing = await feeRepo.listFeeBalances(adminA, { balance: "owing" });
    expect(owing.items.map((r) => [r.fullName, r.balance, r.unpaidCount])).toEqual([
      ["Full Payer", "29.75", 1],
      ["Partial Payer", "56.00", 3],
    ]);
    const paidUp = await feeRepo.listFeeBalances(adminA, { balance: "paid" });
    expect(paidUp.items.map((r) => r.fullName)).toEqual(["Scholar"]);
  });

  it("reverses a payment with a reason: the fees are owed again", async () => {
    const reg = await chargeOf("partial", "Registration fee");
    const payment = await pay("partial", [{ chargeId: reg.id, amount: "15" }]);
    const [paidRow] = await getDb().select().from(students).where(eq(students.id, ids.partial));
    expect(paidRow.registrationFeePaid).toBe(true);

    await expect(feeRepo.reversePayment(adminA, payment.id, { reason: "" })).rejects.toBeInstanceOf(
      errors.ValidationError,
    );
    await feeRepo.reversePayment(adminA, payment.id, { reason: "Wrong student" });
    expect(await chargeOf("partial", "Registration fee")).toMatchObject({ remaining: "15.00" });
    const [row] = await getDb().select().from(students).where(eq(students.id, ids.partial));
    expect(row.registrationFeePaid).toBe(false);
    expect((await feeRepo.getReceipt(adminA, payment.id)).status).toBe("reversed");
    await expect(
      feeRepo.reversePayment(adminA, payment.id, { reason: "Again" }),
    ).rejects.toBeInstanceOf(errors.InvalidStateError);
  });

  it("waives an unpaid charge only", async () => {
    const sept = await chargeOf("partial", "September 2025");
    await feeRepo.waiveCharge(adminA, sept.id, { reason: "Charged by mistake" });
    expect(await chargeOf("partial", "September 2025")).toMatchObject({
      waiveReason: "Charged by mistake",
    });
    expect((await account("partial")).balance).toBe("35.50");
    const paidCharge = await chargeOf("full", "September 2025");
    await expect(
      feeRepo.waiveCharge(adminA, paidCharge.id, { reason: "Not needed" }),
    ).rejects.toBeInstanceOf(errors.InvalidStateError);
  });

  it("keeps the registration fee from dropping below what is paid", async () => {
    const [row] = await getDb().select().from(students).where(eq(students.id, ids.full));
    await expect(
      studentRepo.updateStudent(adminA, ids.full, {
        ...row,
        classId,
        academicYearId: yearId,
        registrationFee: "5",
      }),
    ).rejects.toMatchObject({
      fieldErrors: {
        registrationFee: [
          "10.00 is already paid. Reverse the payment in Student Fees to lower the fee.",
        ],
      },
    });
  });

  it("never deletes a student with payments; unpaid charges go with the student", async () => {
    await expect(studentRepo.deleteStudent(adminA, ids.full)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
    const extra = await register("Mistake", {
      feeType: "full_payment",
      feeAmount: "10",
      registrationFee: "5",
    });
    await studentRepo.deleteStudent(adminA, extra);
    expect((await feeRepo.listFeeBalances(adminA, { search: "Mistake" })).total).toBe(0);
  });

  it("checks permissions and keeps schools apart", async () => {
    const charge = await chargeOf("full", "October 2025");
    expect((await feeRepo.getStudentFeeAccount(viewerA, ids.full)).balance).toBe("29.75");
    await expect(
      feeRepo.recordPayment(viewerA, {
        studentId: ids.full,
        paymentDate: "2025-10-05",
        method: "cash",
        lines: [{ chargeId: charge.id, amount: "1" }],
      }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(feeRepo.chargeMonth(viewerA, OCT)).rejects.toBeInstanceOf(errors.ForbiddenError);

    await expect(feeRepo.getStudentFeeAccount(adminB, ids.full)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    const [payment] = (await account("full")).payments;
    await expect(feeRepo.getReceipt(adminB, payment.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await expect(
      feeRepo.recordPayment(adminB, {
        studentId: ids.full,
        paymentDate: "2025-10-05",
        method: "cash",
        lines: [{ chargeId: charge.id, amount: "1" }],
      }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
    expect((await feeRepo.getFeeSummary(adminB, OCT)).outstanding).toBe("0.00");
    expect((await feeRepo.listPayments(adminB)).total).toBe(0);
    expect((await feeRepo.listPayments(adminA, { month: OCT })).totalCollected).toBe("70.25");
  });
});
