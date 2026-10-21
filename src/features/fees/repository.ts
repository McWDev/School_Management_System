import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type Database } from "@/db";
import {
  academicYears,
  classes,
  feeCharges,
  feePaymentAllocations,
  feePayments,
  feeReceiptCounters,
  students,
  tenants,
  users,
  type FeeCharge,
  type FeePayment,
} from "@/db/schema";
import { getSchoolSettings } from "@/features/settings/repository";
import { latestEnrollment } from "@/features/students/latest-enrollment";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { fromCents, sumMoney, toCents } from "@/lib/money";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  feeBalanceFilterSchema,
  formatReceiptNumber,
  monthEnd,
  monthLabel,
  monthOf,
  monthSchema,
  paymentInputSchema,
  paymentListFilterSchema,
  reasonSchema,
  type PaymentInput,
} from "./schemas";

/*
 * Student fees: monthly and registration charges, payments allocated to
 * charges, receipts, reversals and waivers. Reading needs fees.read; charging
 * a month and waiving need fees.manage_structure; recording a payment needs
 * fees.record_payment; reversing needs fees.reverse_payment. Changes also
 * need access to all branches. Every query is limited to ctx.tenantId, every
 * change is audited, and money is exact (numeric in SQL, cents in code).
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Transaction | ReturnType<typeof getDb>;

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCan(
  ctx: TenantContext,
  permission: "fees.manage_structure" | "fees.record_payment" | "fees.reverse_payment",
) {
  assertPermission(ctx, permission);
  assertAllBranches(ctx);
}

/** Valid (not reversed) payments per charge. */
function paidByCharge(executor: Executor, tenantId: string) {
  return executor
    .select({
      chargeId: feePaymentAllocations.chargeId,
      paid: sql<string>`sum(${feePaymentAllocations.amount})`.as("paid"),
    })
    .from(feePaymentAllocations)
    .innerJoin(
      feePayments,
      and(
        eq(feePayments.tenantId, feePaymentAllocations.tenantId),
        eq(feePayments.id, feePaymentAllocations.paymentId),
        eq(feePayments.status, "valid"),
      ),
    )
    .where(eq(feePaymentAllocations.tenantId, tenantId))
    .groupBy(feePaymentAllocations.chargeId)
    .as("paid_by_charge");
}

/** Outstanding amount per student over charges that are not waived. */
function balancesByStudent(executor: Executor, tenantId: string) {
  const paid = paidByCharge(executor, tenantId);
  const remaining = sql`${feeCharges.amount} - coalesce(${paid.paid}, 0)`;
  return executor
    .select({
      studentId: feeCharges.studentId,
      balance: sql<string>`sum(${remaining})`.as("balance"),
      unpaid: sql<number>`count(*) filter (where ${remaining} > 0)`.as("unpaid"),
    })
    .from(feeCharges)
    .leftJoin(paid, eq(paid.chargeId, feeCharges.id))
    .where(and(eq(feeCharges.tenantId, tenantId), isNull(feeCharges.waivedAt)))
    .groupBy(feeCharges.studentId)
    .as("balances");
}

export function chargeLabel(charge: Pick<FeeCharge, "kind" | "month" | "description" | "note">) {
  if (charge.kind === "registration") return "Registration fee";
  if (charge.kind === "monthly") return monthLabel(charge.month!);
  return charge.note ? `${charge.description} (${charge.note})` : charge.description!;
}

/** Newest first: by month (or the day other fees were charged); registration last. */
const newestFirst = [
  sql`${feeCharges.kind} = 'registration'`,
  sql`coalesce(${feeCharges.month}, ${feeCharges.createdAt}::date) desc`,
  desc(feeCharges.createdAt),
];

/** Oldest first, registration first (receipt lines). */
const oldestFirst = [
  sql`${feeCharges.kind} <> 'registration'`,
  sql`coalesce(${feeCharges.month}, ${feeCharges.createdAt}::date)`,
  feeCharges.createdAt,
];

// ---------------------------------------------------------------- balances

export type FeeBalanceRow = {
  id: string;
  studentNumber: string;
  fullName: string;
  status: "active" | "graduated" | "transferred" | "left";
  feeType: "full_scholarship" | "partial_fee" | "full_payment";
  feeAmount: string | null;
  className: string | null;
  balance: string;
  unpaidCount: number;
  lastPaymentDate: string | null;
};

/** Active students, and any student who still owes, with their balance. */
export async function listFeeBalances(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<FeeBalanceRow>> {
  assertPermission(ctx, "fees.read");
  const { search, classId, balance } = feeBalanceFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);
  const db = getDb();
  const latest = latestEnrollment();
  const balances = balancesByStudent(db, ctx.tenantId);
  const lastPayments = db
    .select({
      studentId: feePayments.studentId,
      lastPaymentDate: sql<string>`max(${feePayments.paymentDate})`.as("last_payment_date"),
    })
    .from(feePayments)
    .where(and(eq(feePayments.tenantId, ctx.tenantId), eq(feePayments.status, "valid")))
    .groupBy(feePayments.studentId)
    .as("last_payments");
  const owed = sql`coalesce(${balances.balance}, 0)`;

  const conditions: (SQL | undefined)[] = [
    eq(students.tenantId, ctx.tenantId),
    or(eq(students.status, "active"), sql`${owed} > 0`),
    classId ? eq(latest.classId, classId) : undefined,
    balance === "owing" ? sql`${owed} > 0` : balance === "paid" ? sql`${owed} <= 0` : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(students.fullName, pattern),
        ilike(students.studentNumber, pattern),
        ilike(students.guardianPhone, pattern),
      ),
    );
  }
  const where = and(...conditions);

  const base = () =>
    db
      .select({
        id: students.id,
        studentNumber: students.studentNumber,
        fullName: students.fullName,
        status: students.status,
        feeType: students.feeType,
        feeAmount: students.feeAmount,
        className: classes.name,
        balance: sql<string>`${owed}::numeric(12,2)::text`,
        unpaidCount: sql<number>`coalesce(${balances.unpaid}, 0)::int`,
        lastPaymentDate: lastPayments.lastPaymentDate,
      })
      .from(students)
      .leftJoinLateral(latest, sql`true`)
      .leftJoin(
        classes,
        and(eq(classes.tenantId, students.tenantId), eq(classes.id, latest.classId)),
      )
      .leftJoin(balances, eq(balances.studentId, students.id))
      .leftJoin(lastPayments, eq(lastPayments.studentId, students.id))
      .where(where);

  const [items, [{ total }]] = await Promise.all([
    base()
      .orderBy(asc(sql`lower(${students.fullName})`), students.id)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db
      .select({ total: count() })
      .from(students)
      .leftJoinLateral(latest, sql`true`)
      .leftJoin(balances, eq(balances.studentId, students.id))
      .where(where),
  ]);
  return toPage(items, total, pageInput);
}

// ----------------------------------------------------------------- summary

export type FeeSummary = {
  month: string;
  /** Charged for the month (not waived). */
  charged: string;
  /** Valid payments received during the month. */
  collected: string;
  /** Still owed over all months. */
  outstanding: string;
  studentsOwing: number;
  /** Active students who would be charged for the month now. */
  toCharge: { count: number; total: string };
  /** Active fee-paying students without a fee amount (not charged). */
  missingAmount: { studentNumber: string; fullName: string }[];
};

/** Students the month can be charged to and who are not charged yet. */
function uncharged(executor: Executor, tenantId: string, month: string) {
  return and(
    eq(students.tenantId, tenantId),
    eq(students.status, "active"),
    ne(students.feeType, "full_scholarship"),
    lte(students.admissionDate, monthEnd(month)),
    sql`not exists (select 1 from ${feeCharges} where ${feeCharges.studentId} = ${students.id} and ${feeCharges.kind} = 'monthly' and ${feeCharges.month} = ${month})`,
  );
}

export async function getFeeSummary(ctx: TenantContext, monthInput: unknown): Promise<FeeSummary> {
  assertPermission(ctx, "fees.read");
  const month = monthSchema.parse(monthInput);
  const db = getDb();
  const paid = paidByCharge(db, ctx.tenantId);
  const remaining = sql`${feeCharges.amount} - coalesce(${paid.paid}, 0)`;
  const [[charged], [collected], [outstanding], [toCharge], missingAmount] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${feeCharges.amount}), 0)::text` })
      .from(feeCharges)
      .where(
        and(
          eq(feeCharges.tenantId, ctx.tenantId),
          eq(feeCharges.kind, "monthly"),
          eq(feeCharges.month, month),
          isNull(feeCharges.waivedAt),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${feePayments.amount}), 0)::text` })
      .from(feePayments)
      .where(
        and(
          eq(feePayments.tenantId, ctx.tenantId),
          eq(feePayments.status, "valid"),
          gte(feePayments.paymentDate, month),
          lte(feePayments.paymentDate, monthEnd(month)),
        ),
      ),
    db
      .select({
        total: sql<string>`coalesce(sum(${remaining}), 0)::text`,
        students: sql<number>`count(distinct ${feeCharges.studentId}) filter (where ${remaining} > 0)::int`,
      })
      .from(feeCharges)
      .leftJoin(paid, eq(paid.chargeId, feeCharges.id))
      .where(and(eq(feeCharges.tenantId, ctx.tenantId), isNull(feeCharges.waivedAt))),
    db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${students.feeAmount}), 0)::text`,
      })
      .from(students)
      .where(and(uncharged(db, ctx.tenantId, month), sql`${students.feeAmount} is not null`)),
    db
      .select({ studentNumber: students.studentNumber, fullName: students.fullName })
      .from(students)
      .where(and(uncharged(db, ctx.tenantId, month), isNull(students.feeAmount)))
      .orderBy(students.studentNumber),
  ]);
  return {
    month,
    charged: fromCents(toCents(charged.total)),
    collected: fromCents(toCents(collected.total)),
    outstanding: fromCents(toCents(outstanding.total)),
    studentsOwing: outstanding.students,
    toCharge: { count: toCharge.count, total: fromCents(toCents(toCharge.total)) },
    missingAmount,
  };
}

/** The latest month that may be charged: next month (fees can be billed ahead). */
function latestChargeableMonth() {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Charge a month: every Active student who pays fees (Full Payment or
 * Partial Fee, with an amount, admitted by the end of the month) and is not
 * charged for it yet gets a charge of their fee amount. Safe to run again.
 */
export async function chargeMonth(
  ctx: TenantContext,
  monthInput: unknown,
): Promise<{ month: string; charged: number; total: string }> {
  assertCan(ctx, "fees.manage_structure");
  const month = parseInput(monthSchema, monthInput);
  if (month > latestChargeableMonth()) {
    throw new ValidationError(undefined, { month: ["You can charge up to next month only."] });
  }
  try {
    return await getDb().transaction(async (tx) => {
      const latest = latestEnrollment();
      const due = await tx
        .select({
          studentId: students.id,
          amount: students.feeAmount,
          academicYearId: latest.academicYearId,
        })
        .from(students)
        .leftJoinLateral(latest, sql`true`)
        .where(and(uncharged(tx, ctx.tenantId, month), sql`${students.feeAmount} is not null`));
      if (due.length) {
        await tx.insert(feeCharges).values(
          due.map((d) => ({
            tenantId: ctx.tenantId,
            studentId: d.studentId,
            kind: "monthly" as const,
            month,
            academicYearId: d.academicYearId,
            amount: d.amount!,
            createdByUserId: ctx.actorUserId,
          })),
        );
      }
      const total = sumMoney(due.map((d) => d.amount!));
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "fee.month_charged",
          entityType: "fee_month",
          after: { month, students: due.length, total },
        },
        tx,
      );
      return { month, charged: due.length, total };
    });
  } catch (error) {
    if (isUniqueViolation(error, "fee_charges_student_month_unique")) {
      throw new ConflictError("This month was being charged at the same time. Try again.");
    }
    throw error;
  }
}

// ----------------------------------------------------------- student account

export type ChargeRow = FeeCharge & { label: string; paid: string; remaining: string };

export type PaymentRow = FeePayment & { lines: { label: string; amount: string }[] };

export type StudentFeeAccount = {
  student: {
    id: string;
    studentNumber: string;
    fullName: string;
    status: "active" | "graduated" | "transferred" | "left";
    feeType: "full_scholarship" | "partial_fee" | "full_payment";
    feeAmount: string | null;
    guardianName: string;
    guardianPhone: string;
    className: string | null;
    academicYearName: string | null;
  };
  charges: ChargeRow[];
  payments: PaymentRow[];
  balance: string;
};

async function chargesWithPaid(executor: Executor, tenantId: string, where: SQL | undefined) {
  const paid = paidByCharge(executor, tenantId);
  const rows = await executor
    .select({ charge: feeCharges, paid: sql<string>`coalesce(${paid.paid}, 0)::text` })
    .from(feeCharges)
    .leftJoin(paid, eq(paid.chargeId, feeCharges.id))
    .where(and(eq(feeCharges.tenantId, tenantId), where))
    .orderBy(...newestFirst);
  return rows.map(({ charge, paid: paidAmount }) => ({
    ...charge,
    label: chargeLabel(charge),
    paid: fromCents(toCents(paidAmount)),
    remaining: fromCents(toCents(charge.amount) - toCents(paidAmount)),
  }));
}

async function paymentLines(executor: Executor, tenantId: string, paymentIds: string[]) {
  if (!paymentIds.length) return new Map<string, { label: string; amount: string }[]>();
  const rows = await executor
    .select({
      paymentId: feePaymentAllocations.paymentId,
      amount: feePaymentAllocations.amount,
      kind: feeCharges.kind,
      month: feeCharges.month,
      description: feeCharges.description,
      note: feeCharges.note,
    })
    .from(feePaymentAllocations)
    .innerJoin(
      feeCharges,
      and(
        eq(feeCharges.tenantId, feePaymentAllocations.tenantId),
        eq(feeCharges.id, feePaymentAllocations.chargeId),
      ),
    )
    .where(
      and(
        eq(feePaymentAllocations.tenantId, tenantId),
        inArray(feePaymentAllocations.paymentId, paymentIds),
      ),
    )
    .orderBy(...oldestFirst);
  const lines = new Map<string, { label: string; amount: string }[]>();
  for (const row of rows) {
    const list = lines.get(row.paymentId) ?? [];
    list.push({ label: chargeLabel(row), amount: row.amount });
    lines.set(row.paymentId, list);
  }
  return lines;
}

export async function getStudentFeeAccount(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentFeeAccount> {
  assertPermission(ctx, "fees.read");
  const id = parseId(studentId);
  const db = getDb();
  const latest = latestEnrollment();
  const [student] = await db
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      fullName: students.fullName,
      status: students.status,
      feeType: students.feeType,
      feeAmount: students.feeAmount,
      guardianName: students.guardianName,
      guardianPhone: students.guardianPhone,
      className: classes.name,
      academicYearName: academicYears.name,
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
    .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, id)));
  if (!student) throw new NotFoundError();

  const [charges, payments] = await Promise.all([
    chargesWithPaid(db, ctx.tenantId, eq(feeCharges.studentId, id)),
    db
      .select()
      .from(feePayments)
      .where(and(eq(feePayments.tenantId, ctx.tenantId), eq(feePayments.studentId, id)))
      .orderBy(desc(feePayments.paymentDate), desc(feePayments.createdAt)),
  ]);
  const lines = await paymentLines(
    db,
    ctx.tenantId,
    payments.map((p) => p.id),
  );
  return {
    student,
    charges,
    payments: payments.map((p) => ({ ...p, lines: lines.get(p.id) ?? [] })),
    balance: sumMoney(charges.filter((c) => !c.waivedAt).map((c) => c.remaining)),
  };
}

// ---------------------------------------------------------------- payments

async function nextReceiptNumber(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .insert(feeReceiptCounters)
    .values({ tenantId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: feeReceiptCounters.tenantId,
      set: { lastNumber: sql`${feeReceiptCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: feeReceiptCounters.lastNumber });
  const { receiptPrefix } = await getSchoolSettings(tx, tenantId);
  return formatReceiptNumber(row.lastNumber, receiptPrefix);
}

/** Keep students.registration_fee_paid in step with the registration charge. */
export async function syncRegistrationPaid(tx: Transaction, tenantId: string, studentId: string) {
  const [charge] = await chargesWithPaid(
    tx,
    tenantId,
    and(
      eq(feeCharges.studentId, studentId),
      eq(feeCharges.kind, "registration"),
      isNull(feeCharges.waivedAt),
    ),
  );
  await tx
    .update(students)
    .set({ registrationFeePaid: Boolean(charge) && toCents(charge.remaining) <= BigInt(0) })
    .where(and(eq(students.tenantId, tenantId), eq(students.id, studentId)));
}

/**
 * Record a payment inside an existing transaction (also used when a student
 * is registered with the registration fee paid). Each line pays part or all
 * of one open charge of the student; the charges are locked while checking.
 */
export async function recordPaymentTx(
  tx: Transaction,
  ctx: TenantContext,
  data: PaymentInput,
): Promise<FeePayment> {
  const [student] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, ctx.tenantId), eq(students.id, data.studentId)))
    .for("update");
  if (!student) throw new NotFoundError();

  const chargeIds = data.lines.map((l) => l.chargeId);
  if (new Set(chargeIds).size !== chargeIds.length) {
    throw new ValidationError("Each fee can be paid only once per payment.");
  }
  const locked = await tx
    .select({ id: feeCharges.id })
    .from(feeCharges)
    .where(
      and(
        eq(feeCharges.tenantId, ctx.tenantId),
        eq(feeCharges.studentId, student.id),
        inArray(feeCharges.id, chargeIds),
      ),
    )
    .for("update");
  if (locked.length !== chargeIds.length) {
    throw new ValidationError("One of the chosen fees was not found. Reload the page.");
  }
  const charges = await chargesWithPaid(tx, ctx.tenantId, inArray(feeCharges.id, chargeIds));
  const byId = new Map(charges.map((c) => [c.id, c]));
  for (const line of data.lines) {
    const charge = byId.get(line.chargeId)!;
    if (charge.waivedAt) {
      throw new ValidationError(`${charge.label} was waived and cannot be paid.`);
    }
    if (toCents(line.amount) > toCents(charge.remaining)) {
      throw new ValidationError(
        toCents(charge.remaining) <= BigInt(0)
          ? `${charge.label} is already paid.`
          : `${charge.label}: only ${charge.remaining} is still owed.`,
      );
    }
  }

  const amount = sumMoney(data.lines.map((l) => l.amount));
  const receiptNumber = await nextReceiptNumber(tx, ctx.tenantId);
  const [payment] = await tx
    .insert(feePayments)
    .values({
      tenantId: ctx.tenantId,
      studentId: student.id,
      receiptNumber,
      paymentDate: data.paymentDate,
      method: data.method,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      amount,
      recordedByUserId: ctx.actorUserId,
    })
    .returning();
  await tx.insert(feePaymentAllocations).values(
    data.lines.map((line) => ({
      tenantId: ctx.tenantId,
      paymentId: payment.id,
      chargeId: line.chargeId,
      amount: line.amount,
    })),
  );
  if (charges.some((c) => c.kind === "registration")) {
    await syncRegistrationPaid(tx, ctx.tenantId, student.id);
  }
  await recordAudit(
    {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "fee_payment.recorded",
      entityType: "fee_payment",
      entityId: payment.id,
      after: {
        ...payment,
        lines: data.lines.map((l) => ({ ...l, label: byId.get(l.chargeId)!.label })),
      },
    },
    tx,
  );
  return payment;
}

export async function recordPayment(ctx: TenantContext, input: unknown): Promise<FeePayment> {
  assertCan(ctx, "fees.record_payment");
  const data = parseInput(paymentInputSchema, input);
  try {
    return await getDb().transaction((tx) => recordPaymentTx(tx, ctx, data));
  } catch (error) {
    if (isUniqueViolation(error, "fee_payments_tenant_receipt_unique")) {
      throw new ConflictError("Another payment was recorded at the same time. Try again.");
    }
    throw error;
  }
}

/** Reverse a payment recorded by mistake. The payment stays on record. */
export async function reversePayment(
  ctx: TenantContext,
  paymentId: string,
  input: unknown,
): Promise<void> {
  assertCan(ctx, "fees.reverse_payment");
  const id = parseId(paymentId);
  const { reason } = parseInput(reasonSchema, input);
  await getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(feePayments)
      .where(and(eq(feePayments.tenantId, ctx.tenantId), eq(feePayments.id, id)))
      .for("update");
    if (!before) throw new NotFoundError();
    if (before.status === "reversed") {
      throw new InvalidStateError("This payment is already reversed.");
    }
    const [after] = await tx
      .update(feePayments)
      .set({
        status: "reversed",
        reversedAt: new Date(),
        reversedByUserId: ctx.actorUserId,
        reversalReason: reason,
      })
      .where(and(eq(feePayments.tenantId, ctx.tenantId), eq(feePayments.id, id)))
      .returning();
    await syncRegistrationPaid(tx, ctx.tenantId, before.studentId);
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "fee_payment.reversed",
        entityType: "fee_payment",
        entityId: id,
        before,
        after,
        reason,
      },
      tx,
    );
  });
}

/** Waive an unpaid charge (e.g. charged by mistake). It stays on record. */
export async function waiveCharge(
  ctx: TenantContext,
  chargeId: string,
  input: unknown,
): Promise<void> {
  assertCan(ctx, "fees.manage_structure");
  const id = parseId(chargeId);
  const { reason } = parseInput(reasonSchema, input);
  await getDb().transaction(async (tx) => {
    await waiveChargeTx(tx, ctx, id, reason);
  });
}

export async function waiveChargeTx(
  tx: Transaction,
  ctx: TenantContext,
  chargeId: string,
  reason: string,
) {
  const [locked] = await tx
    .select({ id: feeCharges.id })
    .from(feeCharges)
    .where(and(eq(feeCharges.tenantId, ctx.tenantId), eq(feeCharges.id, chargeId)))
    .for("update");
  if (!locked) throw new NotFoundError();
  const [charge] = await chargesWithPaid(tx, ctx.tenantId, eq(feeCharges.id, chargeId));
  if (charge.waivedAt) throw new InvalidStateError(`${charge.label} is already waived.`);
  if (toCents(charge.paid) > BigInt(0)) {
    throw new InvalidStateError(
      `${charge.label} has payments. Reverse those payments before waiving it.`,
    );
  }
  await tx
    .update(feeCharges)
    .set({ waivedAt: new Date(), waivedByUserId: ctx.actorUserId, waiveReason: reason })
    .where(and(eq(feeCharges.tenantId, ctx.tenantId), eq(feeCharges.id, chargeId)));
  await recordAudit(
    {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "fee_charge.waived",
      entityType: "fee_charge",
      entityId: chargeId,
      before: charge,
      reason,
    },
    tx,
  );
}

// ------------------------------------------------- registration fee (students)

/**
 * Bring the registration charge in line with the student's registration fee:
 * create it, change its amount, or waive it when the fee becomes 0. The fee
 * cannot drop below what is already paid.
 */
export async function syncRegistrationCharge(
  tx: Transaction,
  ctx: TenantContext,
  student: { id: string; registrationFee: string; academicYearId: string },
) {
  const [existing] = await chargesWithPaid(
    tx,
    ctx.tenantId,
    and(eq(feeCharges.studentId, student.id), eq(feeCharges.kind, "registration")),
  );
  const amount = toCents(student.registrationFee);
  if (!existing) {
    if (amount > BigInt(0)) {
      await tx.insert(feeCharges).values({
        tenantId: ctx.tenantId,
        studentId: student.id,
        kind: "registration",
        academicYearId: student.academicYearId,
        amount: fromCents(amount),
        createdByUserId: ctx.actorUserId,
      });
    }
  } else if (toCents(existing.amount) !== amount) {
    if (existing.waivedAt) {
      throw new ValidationError(undefined, {
        registrationFee: ["The registration fee was waived and cannot be changed."],
      });
    }
    if (amount < toCents(existing.paid)) {
      throw new ValidationError(undefined, {
        registrationFee: [
          `${existing.paid} is already paid. Reverse the payment in Student Fees to lower the fee.`,
        ],
      });
    }
    if (amount === BigInt(0)) {
      await waiveChargeTx(tx, ctx, existing.id, "Registration fee set to 0 on the student record.");
    } else {
      await tx
        .update(feeCharges)
        .set({ amount: fromCents(amount) })
        .where(and(eq(feeCharges.tenantId, ctx.tenantId), eq(feeCharges.id, existing.id)));
    }
  }
  await syncRegistrationPaid(tx, ctx.tenantId, student.id);
  const [open] = await chargesWithPaid(
    tx,
    ctx.tenantId,
    and(
      eq(feeCharges.studentId, student.id),
      eq(feeCharges.kind, "registration"),
      isNull(feeCharges.waivedAt),
    ),
  );
  return open && toCents(open.remaining) > BigInt(0) ? open : null;
}

/** Whether a student has any payment on record (valid or reversed). */
export async function hasPayments(tx: Transaction, tenantId: string, studentId: string) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(feePayments)
    .where(and(eq(feePayments.tenantId, tenantId), eq(feePayments.studentId, studentId)));
  return total > 0;
}

/** Remove the charges of a student being deleted (only when nothing was ever paid). */
export async function deleteChargesOf(tx: Transaction, tenantId: string, studentId: string) {
  await tx
    .delete(feeCharges)
    .where(and(eq(feeCharges.tenantId, tenantId), eq(feeCharges.studentId, studentId)));
}

// ----------------------------------------------------------------- receipts

export type Receipt = PaymentRow & {
  student: {
    studentNumber: string;
    fullName: string;
    className: string | null;
    academicYearName: string | null;
  };
  recordedBy: string | null;
  reversedBy: string | null;
  currencyCode: string;
};

export async function getReceipt(ctx: TenantContext, paymentId: string): Promise<Receipt> {
  assertPermission(ctx, "fees.read");
  const id = parseId(paymentId);
  const db = getDb();
  const latest = latestEnrollment();
  const recorder = alias(users, "recorder");
  const reverser = alias(users, "reverser");
  const [row] = await db
    .select({
      payment: feePayments,
      studentNumber: students.studentNumber,
      fullName: students.fullName,
      className: classes.name,
      academicYearName: academicYears.name,
      recordedBy: recorder.fullName,
      reversedBy: reverser.fullName,
      currencyCode: tenants.currencyCode,
    })
    .from(feePayments)
    .innerJoin(
      students,
      and(eq(students.tenantId, feePayments.tenantId), eq(students.id, feePayments.studentId)),
    )
    .innerJoin(tenants, eq(tenants.id, feePayments.tenantId))
    .leftJoinLateral(latest, sql`true`)
    .leftJoin(classes, and(eq(classes.tenantId, students.tenantId), eq(classes.id, latest.classId)))
    .leftJoin(
      academicYears,
      and(
        eq(academicYears.tenantId, students.tenantId),
        eq(academicYears.id, latest.academicYearId),
      ),
    )
    .leftJoin(recorder, eq(recorder.id, feePayments.recordedByUserId))
    .leftJoin(reverser, eq(reverser.id, feePayments.reversedByUserId))
    .where(and(eq(feePayments.tenantId, ctx.tenantId), eq(feePayments.id, id)));
  if (!row) throw new NotFoundError();
  const lines = await paymentLines(db, ctx.tenantId, [id]);
  return {
    ...row.payment,
    lines: lines.get(id) ?? [],
    student: {
      studentNumber: row.studentNumber,
      fullName: row.fullName,
      className: row.className,
      academicYearName: row.academicYearName,
    },
    recordedBy: row.recordedBy,
    reversedBy: row.reversedBy,
    currencyCode: row.currencyCode,
  };
}

// ------------------------------------------------------------ payments list

export type PaymentListRow = FeePayment & { studentNumber: string; fullName: string };

export async function listPayments(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<PaymentListRow> & { totalCollected: string }> {
  assertPermission(ctx, "fees.read");
  const { search, month, method } = paymentListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);
  const conditions: (SQL | undefined)[] = [
    eq(feePayments.tenantId, ctx.tenantId),
    month ? gte(feePayments.paymentDate, month) : undefined,
    month ? lte(feePayments.paymentDate, monthEnd(month)) : undefined,
    method ? eq(feePayments.method, method) : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(feePayments.receiptNumber, pattern),
        ilike(students.fullName, pattern),
        ilike(students.studentNumber, pattern),
      ),
    );
  }
  const where = and(...conditions);
  const db = getDb();
  const join = and(
    eq(students.tenantId, feePayments.tenantId),
    eq(students.id, feePayments.studentId),
  );
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        payment: feePayments,
        studentNumber: students.studentNumber,
        fullName: students.fullName,
      })
      .from(feePayments)
      .innerJoin(students, join)
      .where(where)
      .orderBy(desc(feePayments.paymentDate), desc(feePayments.createdAt))
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db
      .select({
        total: count(),
        collected: sql<string>`coalesce(sum(${feePayments.amount}) filter (where ${feePayments.status} = 'valid'), 0)::text`,
      })
      .from(feePayments)
      .innerJoin(students, join)
      .where(where),
  ]);
  const items = rows.map((r) => ({
    ...r.payment,
    studentNumber: r.studentNumber,
    fullName: r.fullName,
  }));
  return {
    ...toPage(items, totals.total, pageInput),
    totalCollected: fromCents(toCents(totals.collected)),
  };
}

/** Today ("YYYY-MM-DD") in the school's time zone. */
export async function schoolToday(executor: Executor, tenantId: string) {
  const [school] = await executor
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return new Date().toLocaleDateString("en-CA", { timeZone: school?.timezone ?? "UTC" });
}

/** The current month ("YYYY-MM-01") in the school's time zone. */
export async function currentSchoolMonth(ctx: TenantContext) {
  return monthOf(await schoolToday(getDb(), ctx.tenantId));
}

/** Classes (for filters) and the school's currency, for the fee pages. */
export async function getFeeOptions(ctx: TenantContext) {
  assertPermission(ctx, "fees.read");
  const db = getDb();
  const [classRows, [school], today] = await Promise.all([
    db
      .select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(eq(classes.tenantId, ctx.tenantId))
      .orderBy(
        sql`lower(regexp_replace(${classes.name}, '[0-9].*$', ''))`,
        sql`nullif(substring(${classes.name} from '[0-9]+'), '')::int nulls first`,
        sql`lower(${classes.name})`,
      ),
    db
      .select({ currencyCode: tenants.currencyCode })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId)),
    schoolToday(db, ctx.tenantId),
  ]);
  return { classes: classRows, currencyCode: school?.currencyCode ?? "USD", today };
}
