import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { academicYears } from "./academic-years";
import { users } from "./auth";
import { students } from "./students";
import { tenants } from "./tenants";

/*
 * Student fees (step 6, product owner 2026-10-18): each Active student is
 * charged their fee amount every month, plus the registration fee once.
 * Payments are allocated to charges. Money history is never deleted: a wrong
 * payment is reversed and an unpaid charge is waived, both with a reason.
 */

/** Monthly fee, registration fee, or a fee from the school's fee list. */
export const feeChargeKind = pgEnum("fee_charge_kind", ["monthly", "registration", "other"]);

/**
 * The school's fee list (Exam fee, Uniform, …). Charging from it was removed at
 * the product owner's request (2026-10-19: only the monthly fee is charged); the
 * table is kept so fees charged before then stay on record.
 */
export const feeTypes = pgTable(
  "fee_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    defaultAmount: numeric("default_amount", { precision: 12, scale: 2 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fee_types_tenant_name_unique").on(table.tenantId, sql`lower(${table.name})`),
    unique("fee_types_tenant_id_id_unique").on(table.tenantId, table.id),
    check("fee_types_default_amount_positive", sql`${table.defaultAmount} > 0`),
  ],
);

export const feeCharges = pgTable(
  "fee_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    studentId: uuid("student_id").notNull(),
    kind: feeChargeKind("kind").notNull(),
    /** First day of the charged month (monthly charges only). */
    month: date("month"),
    /** The student's academic year when charged, for reports. */
    academicYearId: uuid("academic_year_id"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** Fee list entry of an "other" charge, and its name when charged. */
    feeTypeId: uuid("fee_type_id"),
    description: text("description"),
    /** Optional note shown with an "other" charge, e.g. "Term 1 exams". */
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedByUserId: uuid("waived_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    waiveReason: text("waive_reason"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "fee_charges_student_fk",
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fee_charges_year_fk",
      columns: [table.tenantId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fee_charges_fee_type_fk",
      columns: [table.tenantId, table.feeTypeId],
      foreignColumns: [feeTypes.tenantId, feeTypes.id],
    }).onDelete("restrict"),
    unique("fee_charges_tenant_id_id_unique").on(table.tenantId, table.id),
    index("fee_charges_fee_type_idx").on(table.feeTypeId),
    // Only fee-list charges have a fee type and name (written without the new
    // enum value, which cannot be used in the migration that adds it).
    check(
      "fee_charges_fee_type_kind",
      sql`(${table.kind} in ('monthly', 'registration')) = (${table.feeTypeId} is null and ${table.description} is null)`,
    ),
    // One charge per student and month, and one registration charge.
    uniqueIndex("fee_charges_student_month_unique")
      .on(table.studentId, table.month)
      .where(sql`${table.kind} = 'monthly'`),
    uniqueIndex("fee_charges_student_registration_unique")
      .on(table.studentId)
      .where(sql`${table.kind} = 'registration'`),
    index("fee_charges_tenant_month_idx").on(table.tenantId, table.month),
    check("fee_charges_amount_positive", sql`${table.amount} > 0`),
    check(
      "fee_charges_month_kind",
      sql`(${table.kind} = 'monthly') = (${table.month} is not null) and (${table.month} is null or extract(day from ${table.month}) = 1)`,
    ),
    check(
      "fee_charges_waive_reason",
      sql`(${table.waivedAt} is null) = (${table.waiveReason} is null)`,
    ),
  ],
);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "mobile_money",
  "bank_transfer",
  "other",
]);
export const paymentStatus = pgEnum("payment_status", ["valid", "reversed"]);

/** Last receipt number given out per school (never reused). */
export const feeReceiptCounters = pgTable("fee_receipt_counters", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
});

export const feePayments = pgTable(
  "fee_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    studentId: uuid("student_id").notNull(),
    /** e.g. "RCT-000001", unique per school. */
    receiptNumber: text("receipt_number").notNull(),
    paymentDate: date("payment_date").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
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
      name: "fee_payments_student_fk",
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    }).onDelete("restrict"),
    unique("fee_payments_tenant_receipt_unique").on(table.tenantId, table.receiptNumber),
    unique("fee_payments_tenant_id_id_unique").on(table.tenantId, table.id),
    index("fee_payments_tenant_date_idx").on(table.tenantId, table.paymentDate),
    index("fee_payments_student_idx").on(table.studentId),
    check("fee_payments_amount_positive", sql`${table.amount} > 0`),
    check(
      "fee_payments_reversal",
      sql`(${table.status} = 'reversed') = (${table.reversedAt} is not null and ${table.reversalReason} is not null)`,
    ),
  ],
);

/** How much of a payment went to each charge. */
export const feePaymentAllocations = pgTable(
  "fee_payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "fee_payment_allocations_payment_fk",
      columns: [table.tenantId, table.paymentId],
      foreignColumns: [feePayments.tenantId, feePayments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fee_payment_allocations_charge_fk",
      columns: [table.tenantId, table.chargeId],
      foreignColumns: [feeCharges.tenantId, feeCharges.id],
    }).onDelete("restrict"),
    unique("fee_payment_allocations_payment_charge_unique").on(table.paymentId, table.chargeId),
    index("fee_payment_allocations_charge_idx").on(table.chargeId),
    check("fee_payment_allocations_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type FeeCharge = typeof feeCharges.$inferSelect;
export type FeeType = typeof feeTypes.$inferSelect;
export type FeePayment = typeof feePayments.$inferSelect;
