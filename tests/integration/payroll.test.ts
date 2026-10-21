// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, workTypes } from "@/db/schema";
import * as payrollRepo from "@/features/payroll/repository";
import * as staffRepo from "@/features/staff/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/*
 * Staff salaries: monthly payroll with bonus and deduction, full and part
 * payments with payslips, reversals, protected history and school isolation.
 */
describe.skipIf(!hasDatabase)("staff salaries", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;
  const ids: Record<string, string> = {};
  const OCT = "2025-10";

  const pay = (key: string, input: Record<string, string>, ctx = adminA) =>
    payrollRepo.paySalary(ctx, OCT, {
      staffId: ids[key],
      paymentDate: "2025-10-28",
      method: "cash",
      bonus: "",
      deduction: "",
      ...input,
    });
  let teacherType: string;
  const inputFor = (fullName: string, salary: string, status = "active") => ({
    fullName,
    workTypeId: teacherType,
    gender: "female",
    dateOfBirth: "1990-01-01",
    phone: "+252 61 111 1111",
    location: "Hodan",
    hireDate: "2020-01-01",
    salary,
    status,
  });
  const rowOf = async (key: string) =>
    (await payrollRepo.getPayroll(adminA, OCT)).rows.find((r) => r.staffId === ids[key])!;

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `PY-${run}-${code}`,
      name: `Payroll ${code}`,
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
      permissions: ["staff.read"],
    });
    const [type] = await getDb()
      .select({ id: workTypes.id })
      .from(workTypes)
      .where(and(eq(workTypes.tenantId, a.id), eq(workTypes.name, "Teacher")));
    teacherType = type.id;
    const member = async (fullName: string, salary: string, status = "active") => {
      const created = await staffRepo.createStaff(adminA, inputFor(fullName, salary));
      if (status !== "active") {
        await staffRepo.updateStaff(adminA, created.id, inputFor(fullName, salary, status));
      }
      return created.id;
    };
    ids.hodan = await member("Hodan Teacher", "300");
    ids.ali = await member("Ali Teacher", "250.50");
    ids.volunteer = await member("Volunteer", "");
    ids.left = await member("Left Teacher", "200", "left");
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("lists Active staff with a salary on the month's payroll", async () => {
    const payroll = await payrollRepo.getPayroll(adminA, OCT);
    expect(payroll.rows.map((r) => [r.fullName, r.baseSalary, r.net, r.state])).toEqual([
      ["Ali Teacher", "250.50", "250.50", "unpaid"],
      ["Hodan Teacher", "300.00", "300.00", "unpaid"],
    ]);
    expect(payroll.totals).toEqual({ net: "550.50", paid: "0.00", remaining: "550.50" });
    expect(payroll.withoutSalary.map((s) => s.fullName)).toEqual(["Volunteer"]);
  });

  it("pays with a bonus and a deduction, in parts, never more than owed", async () => {
    const first = await pay("hodan", {
      amount: "200",
      bonus: "50",
      deduction: "20",
      note: "Extra classes; advance",
    });
    expect(first.payslipNumber).toBe("PAY-000001");
    expect(await rowOf("hodan")).toMatchObject({
      bonus: "50.00",
      deduction: "20.00",
      net: "330.00",
      paid: "200.00",
      remaining: "130.00",
      state: "part",
      note: "Extra classes; advance",
    });
    await expect(
      pay("hodan", { amount: "130.01", bonus: "50", deduction: "20" }),
    ).rejects.toMatchObject({ fieldErrors: { amount: ["Only 130.00 is still to pay."] } });
    // Net pay cannot drop below what is already paid.
    await expect(pay("hodan", { amount: "1", bonus: "0", deduction: "150" })).rejects.toMatchObject(
      {
        fieldErrors: { deduction: ["200.00 is already paid, so net pay cannot be lower."] },
      },
    );
    const second = await pay("hodan", { amount: "130", bonus: "50", deduction: "20" });
    expect(second.payslipNumber).toBe("PAY-000002");
    expect((await rowOf("hodan")).state).toBe("paid");
    await expect(pay("hodan", { amount: "1", bonus: "50", deduction: "20" })).rejects.toMatchObject(
      { fieldErrors: { amount: ["This month is already paid in full."] } },
    );

    const slip = await payrollRepo.getPayslip(adminA, second.id);
    expect(slip).toMatchObject({
      month: "2025-10-01",
      baseSalary: "300.00",
      net: "330.00",
      amount: "130.00",
      paidToDate: "330.00",
      remaining: "0.00",
      staff: { fullName: "Hodan Teacher", workTypeName: "Teacher" },
      currencyCode: "USD",
    });
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, first.id), eq(auditLogs.action, "salary.paid")));
    expect(entry.afterData).toMatchObject({ staff: "Hodan Teacher", month: "2025-10-01" });
  });

  it("keeps a paid month's salary when the salary changes later", async () => {
    await staffRepo.updateStaff(adminA, ids.hodan, inputFor("Hodan Teacher", "400"));
    expect((await rowOf("hodan")).baseSalary).toBe("300.00");
    // Ali is not paid yet: his month follows his new salary.
    await staffRepo.updateStaff(adminA, ids.ali, inputFor("Ali Teacher", "260"));
    expect((await rowOf("ali")).baseSalary).toBe("260.00");
  });

  it("refuses staff who are not on the payroll", async () => {
    await expect(pay("volunteer", { amount: "10" })).rejects.toMatchObject({
      message: "Volunteer is not on the payroll (Active staff with a salary).",
    });
    await expect(pay("left", { amount: "10" })).rejects.toBeInstanceOf(errors.ValidationError);
    await expect(
      payrollRepo.paySalary(adminA, "2099-01", {
        staffId: ids.ali,
        amount: "10",
        paymentDate: "2025-10-28",
        method: "cash",
        bonus: "",
        deduction: "",
      }),
    ).rejects.toBeInstanceOf(errors.ValidationError);
  });

  it("cancels a payment with a reason: it is owed again", async () => {
    const payment = await pay("ali", { amount: "260", method: "mobile_money", reference: "EVC-1" });
    expect((await rowOf("ali")).state).toBe("paid");
    await expect(
      payrollRepo.cancelSalaryPayment(adminA, payment.id, { reason: "" }),
    ).rejects.toBeInstanceOf(errors.ValidationError);
    await payrollRepo.cancelSalaryPayment(adminA, payment.id, { reason: "Paid twice" });
    expect(await rowOf("ali")).toMatchObject({ paid: "0.00", state: "unpaid" });
    expect((await payrollRepo.getPayslip(adminA, payment.id)).status).toBe("reversed");
    await expect(
      payrollRepo.cancelSalaryPayment(adminA, payment.id, { reason: "Again" }),
    ).rejects.toBeInstanceOf(errors.InvalidStateError);
    const payments = await payrollRepo.listMonthPayments(adminA, OCT);
    expect(payments.map((p) => [p.fullName, p.amount, p.status])).toContainEqual([
      "Ali Teacher",
      "260.00",
      "reversed",
    ]);
  });

  it("reports all payments with filters and the total of valid ones", async () => {
    const report = (filters: Record<string, string> = {}) =>
      payrollRepo.getSalaryPaymentReport(adminA, filters);
    // Hodan: 200 + 130 (valid); Ali: 260 (reversed).
    expect(await report()).toMatchObject({ totalPaid: "330.00", validCount: 2, reversedCount: 1 });
    const hodan = await report({ staffId: ids.hodan });
    expect(hodan.rows.map((p) => p.amount)).toEqual(["130.00", "200.00"]);
    expect((await report({ status: "reversed" })).rows.map((p) => p.fullName)).toEqual([
      "Ali Teacher",
    ]);
    expect(await report({ method: "mobile_money" })).toMatchObject({
      totalPaid: "0.00",
      validCount: 0,
      reversedCount: 1,
    });
    expect((await report({ month: "2025-10" })).rows).toHaveLength(3);
    expect((await report({ month: "2025-11" })).rows).toHaveLength(0);
    expect((await report({ from: "2025-10-28", to: "2025-10-28" })).rows).toHaveLength(3);
    expect((await report({ from: "2025-10-29" })).rows).toHaveLength(0);
    // Unknown filter values are ignored rather than failing.
    expect((await report({ method: "card", staffId: "nope" })).rows).toHaveLength(3);
    expect((await payrollRepo.getSalaryPaymentReport(adminB)).rows).toEqual([]);
  });

  it("cancelling payments puts the month back to its original state", async () => {
    const hodanPayments = (await payrollRepo.listMonthPayments(adminA, OCT)).filter(
      (p) => p.staffId === ids.hodan,
    );
    const [latest, earliest] = hodanPayments; // newest first: 130, then 200
    expect([latest.amount, earliest.amount]).toEqual(["130.00", "200.00"]);

    // One payment left: the bonus and deduction stay, the 130 is owed again.
    await payrollRepo.cancelSalaryPayment(adminA, latest.id, { reason: "Wrong amount" });
    expect(await rowOf("hodan")).toMatchObject({
      bonus: "50.00",
      deduction: "20.00",
      net: "330.00",
      paid: "200.00",
      remaining: "130.00",
      state: "part",
    });

    // No payment left: back to the original month, on the current salary (400).
    await payrollRepo.cancelSalaryPayment(adminA, earliest.id, {
      reason: "Paid to the wrong person",
    });
    expect(await rowOf("hodan")).toMatchObject({
      entryId: null,
      baseSalary: "400.00",
      bonus: "0.00",
      deduction: "0.00",
      note: null,
      net: "400.00",
      paid: "0.00",
      state: "unpaid",
    });
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityId, earliest.id), eq(auditLogs.action, "salary.payment_cancelled")),
      );
    expect(entry.afterData).toMatchObject({ monthRestored: true });
    expect(entry.reason).toBe("Paid to the wrong person");

    // Both payslips stay on record as cancelled; paying again starts fresh.
    expect((await payrollRepo.getPayslip(adminA, earliest.id)).status).toBe("reversed");
    const again = await pay("hodan", { amount: "400" });
    expect(again.payslipNumber).toBe("PAY-000004");
    expect(await rowOf("hodan")).toMatchObject({ baseSalary: "400.00", state: "paid" });
  });

  it("keeps staff with salary records from being deleted", async () => {
    await expect(staffRepo.deleteStaff(adminA, ids.hodan)).rejects.toMatchObject({
      message:
        "Hodan Teacher has salary records and cannot be deleted. Set the status to Left instead.",
    });
  });

  it("checks permissions and keeps schools apart", async () => {
    expect((await payrollRepo.getPayroll(viewerA, OCT)).rows).toHaveLength(2);
    await expect(pay("ali", { amount: "1" }, viewerA)).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
    expect((await payrollRepo.getPayroll(adminB, OCT)).rows).toEqual([]);
    await expect(pay("ali", { amount: "1" }, adminB)).rejects.toBeInstanceOf(errors.NotFoundError);
    const [payment] = await payrollRepo.listMonthPayments(adminA, OCT);
    await expect(payrollRepo.getPayslip(adminB, payment.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
  });
});
