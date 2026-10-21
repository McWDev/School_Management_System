import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type Database } from "@/db";
import {
  payrollEntries,
  payslipCounters,
  salaryPayments,
  staff,
  tenants,
  users,
  workTypes,
  type PayrollEntry,
  type SalaryPayment,
} from "@/db/schema";
import { monthSchema, reasonSchema } from "@/features/fees/schemas";
import { getSchoolSettings } from "@/features/settings/repository";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { fromCents, sumMoney, toCents } from "@/lib/money";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  formatPayslipNumber,
  salaryPaymentFilterSchema,
  salaryPaymentInputSchema,
  type SalaryPaymentFilters,
} from "./schemas";

/*
 * Staff salaries: one payroll entry per staff member and month (the salary at
 * the time, plus bonus, minus deduction) and payments against it. Reading
 * needs staff.read; paying and reversing need staff.manage and access to all
 * branches. Every query is limited to ctx.tenantId, every change is audited,
 * and money is exact (numeric in SQL, cents in code).
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Transaction | ReturnType<typeof getDb>;

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCanPay(ctx: TenantContext) {
  assertPermission(ctx, "staff.manage");
  assertAllBranches(ctx);
}

/** The latest month that may be paid: next month (salaries can be paid ahead). */
function latestPayableMonth() {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

/** Valid (not reversed) payments per payroll entry. */
async function paidByEntry(executor: Executor, tenantId: string, entryIds: string[]) {
  if (!entryIds.length) return new Map<string, string>();
  const rows = await executor
    .select({
      entryId: salaryPayments.entryId,
      paid: sql<string>`sum(${salaryPayments.amount})::text`,
    })
    .from(salaryPayments)
    .where(
      and(
        eq(salaryPayments.tenantId, tenantId),
        eq(salaryPayments.status, "valid"),
        inArray(salaryPayments.entryId, entryIds),
      ),
    )
    .groupBy(salaryPayments.entryId);
  return new Map(rows.map((r) => [r.entryId, fromCents(toCents(r.paid))]));
}

/**
 * An entry with no valid payment and no bonus, deduction or note is as if the
 * month was never paid: it follows the staff member's current salary.
 */
function isUntouched(
  entry: Pick<PayrollEntry, "bonus" | "deduction" | "note">,
  paid: string | undefined,
) {
  return (
    (!paid || toCents(paid) === BigInt(0)) &&
    toCents(entry.bonus) === BigInt(0) &&
    toCents(entry.deduction) === BigInt(0) &&
    !entry.note
  );
}

function net(entry: Pick<PayrollEntry, "baseSalary" | "bonus" | "deduction">) {
  return fromCents(toCents(entry.baseSalary) + toCents(entry.bonus) - toCents(entry.deduction));
}

// ----------------------------------------------------------------- payroll

export type PayrollRow = {
  staffId: string;
  fullName: string;
  workTypeName: string;
  status: "active" | "inactive" | "left";
  entryId: string | null;
  baseSalary: string;
  bonus: string;
  deduction: string;
  note: string | null;
  net: string;
  paid: string;
  remaining: string;
  state: "unpaid" | "part" | "paid";
};

export type Payroll = {
  month: string;
  rows: PayrollRow[];
  totals: { net: string; paid: string; remaining: string };
  /** Active staff without a salary (not on the payroll). */
  withoutSalary: { id: string; fullName: string }[];
};

/**
 * The month's payroll: every Active staff member with a salary, and anyone
 * already paid or adjusted for the month, with net pay, paid and remaining.
 */
export async function getPayroll(ctx: TenantContext, monthInput: unknown): Promise<Payroll> {
  assertPermission(ctx, "staff.read");
  const month = monthSchema.parse(monthInput);
  const db = getDb();
  const [staffRows, entries] = await Promise.all([
    db
      .select({
        id: staff.id,
        fullName: staff.fullName,
        status: staff.status,
        salary: staff.salary,
        workTypeName: workTypes.name,
      })
      .from(staff)
      .innerJoin(
        workTypes,
        and(eq(workTypes.tenantId, staff.tenantId), eq(workTypes.id, staff.workTypeId)),
      )
      .where(eq(staff.tenantId, ctx.tenantId))
      .orderBy(asc(sql`lower(${staff.fullName})`)),
    db
      .select()
      .from(payrollEntries)
      .where(and(eq(payrollEntries.tenantId, ctx.tenantId), eq(payrollEntries.month, month))),
  ]);
  const paid = await paidByEntry(
    db,
    ctx.tenantId,
    entries.map((e) => e.id),
  );

  const rows: PayrollRow[] = [];
  for (const s of staffRows) {
    const found = entries.find((e) => e.staffId === s.id);
    // A month whose payments were all cancelled is back to its original state.
    const entry = found && !isUntouched(found, paid.get(found.id)) ? found : undefined;
    if (!entry && !(s.status === "active" && s.salary)) continue;
    const base = entry ? entry.baseSalary : s.salary!;
    const bonus = entry?.bonus ?? "0.00";
    const deduction = entry?.deduction ?? "0.00";
    const netPay = net({ baseSalary: base, bonus, deduction });
    const paidAmount = (entry && paid.get(entry.id)) ?? "0.00";
    const remaining = fromCents(toCents(netPay) - toCents(paidAmount));
    rows.push({
      staffId: s.id,
      fullName: s.fullName,
      workTypeName: s.workTypeName,
      status: s.status,
      entryId: entry?.id ?? null,
      baseSalary: fromCents(toCents(base)),
      bonus: fromCents(toCents(bonus)),
      deduction: fromCents(toCents(deduction)),
      note: entry?.note ?? null,
      net: netPay,
      paid: paidAmount,
      remaining,
      state:
        toCents(remaining) <= BigInt(0)
          ? "paid"
          : toCents(paidAmount) > BigInt(0)
            ? "part"
            : "unpaid",
    });
  }
  return {
    month,
    rows,
    totals: {
      net: sumMoney(rows.map((r) => r.net)),
      paid: sumMoney(rows.map((r) => r.paid)),
      remaining: sumMoney(rows.map((r) => r.remaining)),
    },
    withoutSalary: staffRows
      .filter((s) => s.status === "active" && !s.salary)
      .map((s) => ({ id: s.id, fullName: s.fullName })),
  };
}

// ---------------------------------------------------------------- payments

async function nextPayslipNumber(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .insert(payslipCounters)
    .values({ tenantId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: payslipCounters.tenantId,
      set: { lastNumber: sql`${payslipCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: payslipCounters.lastNumber });
  const { payslipPrefix } = await getSchoolSettings(tx, tenantId);
  return formatPayslipNumber(row.lastNumber, payslipPrefix);
}

/**
 * Pay (part of) a staff member's salary for a month. The bonus, deduction and
 * note given here are saved on the month's entry (net pay cannot drop below
 * what is already paid), and the amount cannot exceed what is still owed.
 */
export async function paySalary(
  ctx: TenantContext,
  monthInput: unknown,
  input: unknown,
): Promise<SalaryPayment> {
  assertCanPay(ctx);
  const month = parseInput(monthSchema, monthInput);
  if (month > latestPayableMonth()) {
    throw new ValidationError("Salaries can be paid up to next month only.");
  }
  const data = parseInput(salaryPaymentInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [member] = await tx
        .select({
          id: staff.id,
          fullName: staff.fullName,
          status: staff.status,
          salary: staff.salary,
        })
        .from(staff)
        .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.id, data.staffId)))
        .for("update");
      if (!member) throw new NotFoundError();

      let [entry] = await tx
        .select()
        .from(payrollEntries)
        .where(
          and(
            eq(payrollEntries.tenantId, ctx.tenantId),
            eq(payrollEntries.staffId, member.id),
            eq(payrollEntries.month, month),
          ),
        )
        .for("update");
      const before = entry ?? null;
      let paidSoFar = entry
        ? ((await paidByEntry(tx, ctx.tenantId, [entry.id])).get(entry.id) ?? "0.00")
        : "0.00";
      // A new month, or one whose payments were all cancelled, takes the current salary.
      const fresh = !entry || toCents(paidSoFar) === BigInt(0);
      if (fresh && (member.status !== "active" || !member.salary)) {
        throw new ValidationError(
          `${member.fullName} is not on the payroll (Active staff with a salary).`,
        );
      }
      if (!entry) {
        [entry] = await tx
          .insert(payrollEntries)
          .values({
            tenantId: ctx.tenantId,
            staffId: member.id,
            month,
            baseSalary: member.salary!,
          })
          .returning();
      } else if (fresh) {
        [entry] = await tx
          .update(payrollEntries)
          .set({ baseSalary: member.salary! })
          .where(and(eq(payrollEntries.tenantId, ctx.tenantId), eq(payrollEntries.id, entry.id)))
          .returning();
        paidSoFar = "0.00";
      }

      const netPay = net({
        baseSalary: entry.baseSalary,
        bonus: data.bonus,
        deduction: data.deduction,
      });
      if (toCents(netPay) < BigInt(0)) {
        throw new ValidationError(undefined, {
          deduction: ["The deduction cannot be more than the salary and bonus."],
        });
      }
      if (toCents(netPay) < toCents(paidSoFar)) {
        throw new ValidationError(undefined, {
          deduction: [`${paidSoFar} is already paid, so net pay cannot be lower.`],
        });
      }
      const remaining = toCents(netPay) - toCents(paidSoFar);
      if (toCents(data.amount) > remaining) {
        throw new ValidationError(undefined, {
          amount: [
            remaining <= BigInt(0)
              ? "This month is already paid in full."
              : `Only ${fromCents(remaining)} is still to pay.`,
          ],
        });
      }

      [entry] = await tx
        .update(payrollEntries)
        .set({ bonus: data.bonus, deduction: data.deduction, note: data.note ?? null })
        .where(and(eq(payrollEntries.tenantId, ctx.tenantId), eq(payrollEntries.id, entry.id)))
        .returning();
      const payslipNumber = await nextPayslipNumber(tx, ctx.tenantId);
      const [payment] = await tx
        .insert(salaryPayments)
        .values({
          tenantId: ctx.tenantId,
          entryId: entry.id,
          payslipNumber,
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference ?? null,
          amount: data.amount,
          recordedByUserId: ctx.actorUserId,
        })
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "salary.paid",
          entityType: "salary_payment",
          entityId: payment.id,
          before: before && { bonus: before.bonus, deduction: before.deduction, note: before.note },
          after: { ...payment, staff: member.fullName, month, entry },
        },
        tx,
      );
      return payment;
    });
  } catch (error) {
    if (isUniqueViolation(error, "payroll_entries_staff_month_unique")) {
      throw new ConflictError("This salary was being paid at the same time. Try again.");
    }
    if (isUniqueViolation(error, "salary_payments_tenant_payslip_unique")) {
      throw new ConflictError("Another payment was recorded at the same time. Try again.");
    }
    throw error;
  }
}

/**
 * Cancel a salary payment (product owner, 2026-10-21): the amount is owed
 * again and, when no other valid payment remains for the month, its bonus,
 * deduction and note are cleared so the month is back to its original state.
 * The payment stays on record as cancelled (status "reversed").
 */
export async function cancelSalaryPayment(
  ctx: TenantContext,
  paymentId: string,
  input: unknown,
): Promise<void> {
  assertCanPay(ctx);
  const id = parseId(paymentId);
  const { reason } = parseInput(reasonSchema, input);
  await getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(salaryPayments)
      .where(and(eq(salaryPayments.tenantId, ctx.tenantId), eq(salaryPayments.id, id)))
      .for("update");
    if (!before) throw new NotFoundError();
    if (before.status === "reversed") {
      throw new InvalidStateError("This payment is already cancelled.");
    }
    const [entryBefore] = await tx
      .select()
      .from(payrollEntries)
      .where(and(eq(payrollEntries.tenantId, ctx.tenantId), eq(payrollEntries.id, before.entryId)))
      .for("update");
    const [after] = await tx
      .update(salaryPayments)
      .set({
        status: "reversed",
        reversedAt: new Date(),
        reversedByUserId: ctx.actorUserId,
        reversalReason: reason,
      })
      .where(and(eq(salaryPayments.tenantId, ctx.tenantId), eq(salaryPayments.id, id)))
      .returning();
    const stillPaid = (await paidByEntry(tx, ctx.tenantId, [before.entryId])).get(before.entryId);
    const restored = !stillPaid || toCents(stillPaid) === BigInt(0);
    if (restored) {
      await tx
        .update(payrollEntries)
        .set({ bonus: "0", deduction: "0", note: null })
        .where(
          and(eq(payrollEntries.tenantId, ctx.tenantId), eq(payrollEntries.id, before.entryId)),
        );
    }
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "salary.payment_cancelled",
        entityType: "salary_payment",
        entityId: id,
        before: { ...before, entry: entryBefore },
        after: { ...after, monthRestored: restored },
        reason,
      },
      tx,
    );
  });
}

export type SalaryPaymentRow = SalaryPayment & { staffId: string; fullName: string };

/** Payments made for a month's payroll (valid and reversed). */
export async function listMonthPayments(
  ctx: TenantContext,
  monthInput: unknown,
): Promise<SalaryPaymentRow[]> {
  assertPermission(ctx, "staff.read");
  const month = monthSchema.parse(monthInput);
  const rows = await getDb()
    .select({ payment: salaryPayments, staffId: staff.id, fullName: staff.fullName })
    .from(salaryPayments)
    .innerJoin(
      payrollEntries,
      and(
        eq(payrollEntries.tenantId, salaryPayments.tenantId),
        eq(payrollEntries.id, salaryPayments.entryId),
      ),
    )
    .innerJoin(
      staff,
      and(eq(staff.tenantId, payrollEntries.tenantId), eq(staff.id, payrollEntries.staffId)),
    )
    .where(and(eq(salaryPayments.tenantId, ctx.tenantId), eq(payrollEntries.month, month)))
    .orderBy(desc(salaryPayments.paymentDate), desc(salaryPayments.createdAt));
  return rows.map((r) => ({ ...r.payment, staffId: r.staffId, fullName: r.fullName }));
}

// ----------------------------------------------------------------- payslip

export type Payslip = SalaryPayment & {
  month: string;
  staff: { fullName: string; workTypeName: string; phone: string | null; hireDate: string | null };
  baseSalary: string;
  bonus: string;
  deduction: string;
  note: string | null;
  net: string;
  /** Valid payments for the month up to and including this one. */
  paidToDate: string;
  remaining: string;
  recordedBy: string | null;
  currencyCode: string;
};

export async function getPayslip(ctx: TenantContext, paymentId: string): Promise<Payslip> {
  assertPermission(ctx, "staff.read");
  const id = parseId(paymentId);
  const db = getDb();
  const recorder = alias(users, "recorder");
  const [row] = await db
    .select({
      payment: salaryPayments,
      entry: payrollEntries,
      fullName: staff.fullName,
      phone: staff.phone,
      hireDate: staff.hireDate,
      workTypeName: workTypes.name,
      recordedBy: recorder.fullName,
      currencyCode: tenants.currencyCode,
    })
    .from(salaryPayments)
    .innerJoin(
      payrollEntries,
      and(
        eq(payrollEntries.tenantId, salaryPayments.tenantId),
        eq(payrollEntries.id, salaryPayments.entryId),
      ),
    )
    .innerJoin(
      staff,
      and(eq(staff.tenantId, payrollEntries.tenantId), eq(staff.id, payrollEntries.staffId)),
    )
    .innerJoin(
      workTypes,
      and(eq(workTypes.tenantId, staff.tenantId), eq(workTypes.id, staff.workTypeId)),
    )
    .innerJoin(tenants, eq(tenants.id, salaryPayments.tenantId))
    .leftJoin(recorder, eq(recorder.id, salaryPayments.recordedByUserId))
    .where(and(eq(salaryPayments.tenantId, ctx.tenantId), eq(salaryPayments.id, id)));
  if (!row) throw new NotFoundError();
  const { payment, entry } = row;
  // Valid payments of the month made before this one (and this one, if valid).
  const earlier = await db
    .select({ amount: salaryPayments.amount })
    .from(salaryPayments)
    .where(
      and(
        eq(salaryPayments.tenantId, ctx.tenantId),
        eq(salaryPayments.entryId, entry.id),
        eq(salaryPayments.status, "valid"),
        or(
          sql`${salaryPayments.createdAt} < ${payment.createdAt}`,
          eq(salaryPayments.id, payment.id),
        ),
      ),
    );
  const netPay = net(entry);
  const paidToDate = sumMoney(earlier.map((e) => e.amount));
  return {
    ...payment,
    month: entry.month,
    staff: {
      fullName: row.fullName,
      workTypeName: row.workTypeName,
      phone: row.phone,
      hireDate: row.hireDate,
    },
    baseSalary: fromCents(toCents(entry.baseSalary)),
    bonus: fromCents(toCents(entry.bonus)),
    deduction: fromCents(toCents(entry.deduction)),
    note: entry.note,
    net: netPay,
    paidToDate,
    remaining: fromCents(toCents(netPay) - toCents(paidToDate)),
    recordedBy: row.recordedBy,
    currencyCode: row.currencyCode,
  };
}

/** Whether a staff member has salary records (money history is never deleted). */
export async function hasPayrollRecords(tx: Transaction, tenantId: string, staffId: string) {
  const [row] = await tx
    .select({ id: payrollEntries.id })
    .from(payrollEntries)
    .where(and(eq(payrollEntries.tenantId, tenantId), eq(payrollEntries.staffId, staffId)))
    .limit(1);
  return Boolean(row);
}

// ----------------------------------------------------------------- report

export type SalaryReportRow = SalaryPayment & {
  month: string;
  staffId: string;
  fullName: string;
  workTypeName: string;
};

export type SalaryReport = {
  filters: SalaryPaymentFilters;
  rows: SalaryReportRow[];
  /** Valid payments only (reversed ones do not count). */
  totalPaid: string;
  validCount: number;
  reversedCount: number;
};

/** Largest report shown or exported at once. */
export const SALARY_REPORT_LIMIT = 2000;

/**
 * All salary payments matching the filters (payment date range, staff member,
 * pay month, method, status), newest first, with the total paid.
 */
export async function getSalaryPaymentReport(
  ctx: TenantContext,
  filtersInput: unknown = {},
): Promise<SalaryReport> {
  assertPermission(ctx, "staff.read");
  const filters = salaryPaymentFilterSchema.parse(filtersInput);
  const where = and(
    eq(salaryPayments.tenantId, ctx.tenantId),
    filters.from ? gte(salaryPayments.paymentDate, filters.from) : undefined,
    filters.to ? lte(salaryPayments.paymentDate, filters.to) : undefined,
    filters.staffId ? eq(payrollEntries.staffId, filters.staffId) : undefined,
    filters.month ? eq(payrollEntries.month, filters.month) : undefined,
    filters.method ? eq(salaryPayments.method, filters.method) : undefined,
    filters.status ? eq(salaryPayments.status, filters.status) : undefined,
  );
  const rows = await getDb()
    .select({
      payment: salaryPayments,
      month: payrollEntries.month,
      staffId: staff.id,
      fullName: staff.fullName,
      workTypeName: workTypes.name,
    })
    .from(salaryPayments)
    .innerJoin(
      payrollEntries,
      and(
        eq(payrollEntries.tenantId, salaryPayments.tenantId),
        eq(payrollEntries.id, salaryPayments.entryId),
      ),
    )
    .innerJoin(
      staff,
      and(eq(staff.tenantId, payrollEntries.tenantId), eq(staff.id, payrollEntries.staffId)),
    )
    .innerJoin(
      workTypes,
      and(eq(workTypes.tenantId, staff.tenantId), eq(workTypes.id, staff.workTypeId)),
    )
    .where(where)
    .orderBy(desc(salaryPayments.paymentDate), desc(salaryPayments.createdAt))
    .limit(SALARY_REPORT_LIMIT);
  const items = rows.map((r) => ({
    ...r.payment,
    month: r.month,
    staffId: r.staffId,
    fullName: r.fullName,
    workTypeName: r.workTypeName,
  }));
  const valid = items.filter((p) => p.status === "valid");
  return {
    filters,
    rows: items,
    totalPaid: sumMoney(valid.map((p) => p.amount)),
    validCount: valid.length,
    reversedCount: items.length - valid.length,
  };
}

/** All staff (any status) for the report's staff filter. */
export async function listStaffForReport(ctx: TenantContext) {
  assertPermission(ctx, "staff.read");
  return getDb()
    .select({ id: staff.id, fullName: staff.fullName })
    .from(staff)
    .where(eq(staff.tenantId, ctx.tenantId))
    .orderBy(asc(sql`lower(${staff.fullName})`));
}
