import { sql } from "drizzle-orm";
import {
  check,
  customType,
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
import { users } from "./auth";
import { tenants } from "./tenants";

/** Work types of a school (Teacher, Accountant, Driver, …). Each school manages its own list. */
export const workTypes = pgTable(
  "work_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("work_types_tenant_name_unique").on(table.tenantId, sql`lower(${table.name})`),
    // Target for the composite foreign key from staff (same-school guarantee).
    unique("work_types_tenant_id_id_unique").on(table.tenantId, table.id),
  ],
);

export const staffGender = pgEnum("staff_gender", ["male", "female"]);
/** Active staff can sign in (if they have login access); inactive and left cannot. */
export const staffStatus = pgEnum("staff_status", ["active", "inactive", "left"]);

/**
 * School staff (all employees, whatever their work type). Staff who leave are
 * marked "left", never deleted, so history is kept.
 */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    workTypeId: uuid("work_type_id").notNull(),
    gender: staffGender("gender"),
    dateOfBirth: date("date_of_birth"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    /** Area / district / city where the staff member lives. */
    location: text("location"),
    hireDate: date("hire_date"),
    /** Monthly salary in the school currency; null when not on the payroll. */
    salary: numeric("salary", { precision: 12, scale: 2 }),
    status: staffStatus("status").notNull().default("active"),
    /** Login account of this staff member, when they have login access. */
    userId: uuid("user_id"),
    ...timestamps,
  },
  (table) => [
    // The login account must belong to the same school; one account per staff member.
    foreignKey({
      name: "staff_user_fk",
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }).onDelete("restrict"),
    unique("staff_user_unique").on(table.userId),
    // The work type must belong to the same school as the staff member.
    foreignKey({
      name: "staff_work_type_fk",
      columns: [table.tenantId, table.workTypeId],
      foreignColumns: [workTypes.tenantId, workTypes.id],
    }).onDelete("restrict"),
    unique("staff_tenant_id_id_unique").on(table.tenantId, table.id),
    index("staff_tenant_status_idx").on(table.tenantId, table.status),
    index("staff_work_type_idx").on(table.workTypeId),
    check("staff_salary_positive", sql`${table.salary} is null or ${table.salary} > 0`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Staff photos, stored privately (one per staff member). */
export const staffPhotos = pgTable(
  "staff_photos",
  {
    staffId: uuid("staff_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    data: bytea("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "staff_photos_staff_fk",
      columns: [table.tenantId, table.staffId],
      foreignColumns: [staff.tenantId, staff.id],
    }).onDelete("cascade"),
    check(
      "staff_photos_content_type",
      sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check("staff_photos_size", sql`${table.byteSize} > 0 and ${table.byteSize} <= 1048576`),
  ],
);

export type WorkType = typeof workTypes.$inferSelect;
export type Staff = typeof staff.$inferSelect;
