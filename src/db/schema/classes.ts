import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./tenants";

/** Active classes are in use; inactive ones are kept but not offered for new use. */
export const classStatus = pgEnum("class_status", ["active", "inactive"]);

/**
 * Classes of a school (step 3, product owner 2026-10-17): a name and the
 * number of seats (how many students the class can hold). Kept simple: no
 * grade, branch or academic year.
 */
export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** e.g. "Grade 1A". Unique per school, ignoring capitals. */
    name: text("name").notNull(),
    /** Class seats: the most students this class can hold (1–500). */
    seats: integer("seats").notNull(),
    status: classStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("classes_tenant_name_unique").on(table.tenantId, sql`lower(${table.name})`),
    // Target for composite foreign keys from later tables (same-school guarantee).
    unique("classes_tenant_id_id_unique").on(table.tenantId, table.id),
    index("classes_tenant_status_idx").on(table.tenantId, table.status),
    check("classes_seats_range", sql`${table.seats} between 1 and 500`),
  ],
);

export type SchoolClass = typeof classes.$inferSelect;
