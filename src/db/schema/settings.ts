import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./tenants";

/*
 * General settings of a school (step 10, product owner 2026-10-21): exam
 * rules and number prefixes. A school without a row uses the defaults below.
 */
export const schoolSettings = pgTable(
  "school_settings",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** Average needed to pass (out of 100). */
    passMark: integer("pass_mark").notNull().default(50),
    /** Maximum marks of each part; together they make the subject total of 100. */
    midtermMax: integer("midterm_max").notNull().default(30),
    activitiesMax: integer("activities_max").notNull().default(20),
    finalMax: integer("final_max").notNull().default(50),
    /** Prefixes of new numbers, e.g. STU-0001, RCT-000001, PAY-000001. */
    studentPrefix: text("student_prefix").notNull().default("STU"),
    receiptPrefix: text("receipt_prefix").notNull().default("RCT"),
    payslipPrefix: text("payslip_prefix").notNull().default("PAY"),
    ...timestamps,
  },
  (table) => [
    check("school_settings_pass_mark_range", sql`${table.passMark} between 1 and 100`),
    check(
      "school_settings_parts_total",
      sql`${table.midtermMax} >= 1 and ${table.activitiesMax} >= 1 and ${table.finalMax} >= 1 and ${table.midtermMax} + ${table.activitiesMax} + ${table.finalMax} = 100`,
    ),
    check(
      "school_settings_prefixes",
      sql`${table.studentPrefix} ~ '^[A-Z0-9]{1,6}$' and ${table.receiptPrefix} ~ '^[A-Z0-9]{1,6}$' and ${table.payslipPrefix} ~ '^[A-Z0-9]{1,6}$'`,
    ),
  ],
);

export type SchoolSettings = typeof schoolSettings.$inferSelect;
