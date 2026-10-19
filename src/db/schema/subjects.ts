import { sql } from "drizzle-orm";
import {
  foreignKey,
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
import { staff } from "./staff";
import { tenants } from "./tenants";

/** Active subjects are taught; inactive ones are kept but not offered for new use. */
export const subjectStatus = pgEnum("subject_status", ["active", "inactive"]);

/**
 * Last subject code number given out per school. Codes are never reused,
 * even after a subject is deleted (product owner, 2026-10-19: automatic codes).
 */
export const subjectNumberCounters = pgTable("subject_number_counters", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
});

/**
 * Subjects taught at a school (step 7, product owner 2026-10-19): a name
 * (unique in the school), an automatic, permanent code ("SUB-001") and at
 * most one teacher.
 */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** e.g. "Mathematics". */
    name: text("name").notNull(),
    /** Automatic code, e.g. "SUB-001"; never changes. */
    code: text("code").notNull(),
    status: subjectStatus("status").notNull().default("active"),
    /** The staff member (work type Teacher) who teaches it; one at most. */
    teacherStaffId: uuid("teacher_staff_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subjects_tenant_name_unique").on(table.tenantId, sql`lower(${table.name})`),
    unique("subjects_tenant_code_unique").on(table.tenantId, table.code),
    // Target for composite foreign keys from exams (same-school guarantee).
    unique("subjects_tenant_id_id_unique").on(table.tenantId, table.id),
    index("subjects_tenant_status_idx").on(table.tenantId, table.status),
    // The teacher must be staff of the same school.
    foreignKey({
      name: "subjects_teacher_fk",
      columns: [table.tenantId, table.teacherStaffId],
      foreignColumns: [staff.tenantId, staff.id],
    }).onDelete("restrict"),
    index("subjects_teacher_idx").on(table.teacherStaffId),
  ],
);

export type Subject = typeof subjects.$inferSelect;
