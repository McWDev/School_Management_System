import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./tenants";

/** Upcoming years are planned, the Current year is the one students learn in now, Closed years are finished. */
export const academicYearStatus = pgEnum("academic_year_status", ["upcoming", "current", "closed"]);

/** Student learning years of a school, e.g. "2026–2027". At most one is Current. */
export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: academicYearStatus("status").notNull().default("upcoming"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("academic_years_tenant_name_unique").on(table.tenantId, sql`lower(${table.name})`),
    uniqueIndex("academic_years_one_current")
      .on(table.tenantId)
      .where(sql`${table.status} = 'current'`),
    unique("academic_years_tenant_id_id_unique").on(table.tenantId, table.id),
    index("academic_years_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export type AcademicYear = typeof academicYears.$inferSelect;
