import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { users } from "./auth";
import { paymentMethod, paymentStatus } from "./fees";
import { staff } from "./staff";
import { tenants } from "./tenants";

/*
 * Staff salaries (step 9, product owner 2026-10-21): each month every Active
 * staff member with a salary is paid it, plus an optional bonus and minus an
 * optional deduction. Payments can be full or part, get a payslip number, and
 * are never deleted: a wrong payment is reversed with a reason.
 */

/** One staff member's pay for one month. Created when first paid or adjusted. */
export const payrollEntries = pgTable(
  "payroll_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    staffId: uuid("staff_id").notNull(),
    /** First day of the month paid. */
    month: date("month").notNull(),
    /** The salary at the time (later salary changes do not alter it). */
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
    bonus: numeric("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    deduction: numeric("deduction", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Why there is a bonus or deduction, e.g. "Advance" or "Extra classes". */
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "payroll_entries_staff_fk",
      columns: [table.tenantId, table.staffId],
      foreignColumns: [staff.tenantId, staff.id],
    }).onDelete("restrict"),
    unique("payroll_entries_staff_month_unique").on(table.staffId, table.month),
    unique("payroll_entries_tenant_id_id_unique").on(table.tenantId, table.id),
    index("payroll_entries_tenant_month_idx").on(table.tenantId, table.month),
    check("payroll_entries_base_salary_positive", sql`${table.baseSalary} > 0`),
    check("payroll_entries_bonus_not_negative", sql`${table.bonus} >= 0`),
    check("payroll_entries_deduction_range", sql`${table.deduction} >= 0`),
    check(
      "payroll_entries_net_not_negative",
      sql`${table.baseSalary} + ${table.bonus} - ${table.deduction} >= 0`,
    ),
    check("payroll_entries_month_first_day", sql`extract(day from ${table.month}) = 1`),
  ],
);

/** Last payslip number given out per school (never reused). */
export const payslipCounters = pgTable("payslip_counters", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
});

/** A salary payment (full or part) against one month's pay. */
export const salaryPayments = pgTable(
  "salary_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entryId: uuid("entry_id").notNull(),
    /** e.g. "PAY-000001", unique per school. */
    payslipNumber: text("payslip_number").notNull(),
    paymentDate: date("payment_date").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: paymentStatus("status").notNull().default("valid"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reversalReason: text("reversal_reason"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "salary_payments_entry_fk",
      columns: [table.tenantId, table.entryId],
      foreignColumns: [payrollEntries.tenantId, payrollEntries.id],
    }).onDelete("restrict"),
    unique("salary_payments_tenant_payslip_unique").on(table.tenantId, table.payslipNumber),
    index("salary_payments_entry_idx").on(table.entryId),
    index("salary_payments_tenant_date_idx").on(table.tenantId, table.paymentDate),
    check("salary_payments_amount_positive", sql`${table.amount} > 0`),
    check(
      "salary_payments_reversal",
      sql`(${table.status} = 'reversed') = (${table.reversedAt} is not null and ${table.reversalReason} is not null)`,
    ),
  ],
);

export type PayrollEntry = typeof payrollEntries.$inferSelect;
export type SalaryPayment = typeof salaryPayments.$inferSelect;
