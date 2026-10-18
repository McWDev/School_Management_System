import { sql } from "drizzle-orm";
import {
  boolean,
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
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { academicYears } from "./academic-years";
import { classes } from "./classes";
import { tenants } from "./tenants";

export const studentGender = pgEnum("student_gender", ["male", "female"]);
/** Only Active students take a class seat; the others are kept on record. */
export const studentStatus = pgEnum("student_status", [
  "active",
  "graduated",
  "transferred",
  "left",
]);

/** How a student's school fees are paid (product owner, 2026-10-18). */
export const studentFeeType = pgEnum("student_fee_type", [
  "full_scholarship",
  "partial_fee",
  "full_payment",
]);

/**
 * Last Student ID number given out per school. Numbers are never reused, even
 * after a student is deleted (product owner, 2026-10-18: automatic IDs).
 */
export const studentNumberCounters = pgTable("student_number_counters", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
});

/**
 * Students of a school (step 5, product owner 2026-10-18). Required: full
 * name, gender, date of birth, admission date, guardian name and phone.
 * Their class and academic year live in student_enrollments.
 */
export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** Automatic, permanent Student ID, e.g. "STU-0001". */
    studentNumber: text("student_number").notNull(),
    fullName: text("full_name").notNull(),
    gender: studentGender("gender").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    admissionDate: date("admission_date").notNull(),
    guardianName: text("guardian_name").notNull(),
    guardianPhone: text("guardian_phone").notNull(),
    phone: text("phone"),
    address: text("address"),
    status: studentStatus("status").notNull().default("active"),
    feeType: studentFeeType("fee_type").notNull().default("full_payment"),
    /**
     * The fee amount the student pays (school currency): required for Full
     * Payment and Partial Fee (checked in the form), none for Full Scholarship.
     */
    feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }),
    /** Registration fee charged at admission (school currency); 0 means none. */
    registrationFee: numeric("registration_fee", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    registrationFeePaid: boolean("registration_fee_paid").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check(
      "students_fee_amount",
      sql`(${table.feeType} <> 'full_scholarship' or ${table.feeAmount} is null) and coalesce(${table.feeAmount}, 1) > 0`,
    ),
    check("students_registration_fee", sql`${table.registrationFee} >= 0`),
    unique("students_tenant_number_unique").on(table.tenantId, table.studentNumber),
    // Target for composite foreign keys (same-school guarantee).
    unique("students_tenant_id_id_unique").on(table.tenantId, table.id),
    index("students_tenant_status_idx").on(table.tenantId, table.status),
    index("students_tenant_name_idx").on(table.tenantId, sql`lower(${table.fullName})`),
  ],
);

/**
 * A student's class for an academic year. One enrollment per student and
 * year; earlier years stay as history.
 */
export const studentEnrollments = pgTable(
  "student_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    studentId: uuid("student_id").notNull(),
    classId: uuid("class_id").notNull(),
    academicYearId: uuid("academic_year_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "student_enrollments_student_fk",
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    }).onDelete("cascade"),
    // A class or year with students cannot be deleted.
    foreignKey({
      name: "student_enrollments_class_fk",
      columns: [table.tenantId, table.classId],
      foreignColumns: [classes.tenantId, classes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "student_enrollments_year_fk",
      columns: [table.tenantId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.id],
    }).onDelete("restrict"),
    unique("student_enrollments_student_year_unique").on(table.studentId, table.academicYearId),
    index("student_enrollments_class_year_idx").on(table.classId, table.academicYearId),
    index("student_enrollments_year_idx").on(table.academicYearId),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Student photos, stored privately (one per student). */
export const studentPhotos = pgTable(
  "student_photos",
  {
    studentId: uuid("student_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    data: bytea("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "student_photos_student_fk",
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    }).onDelete("cascade"),
    check(
      "student_photos_content_type",
      sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check("student_photos_size", sql`${table.byteSize} > 0 and ${table.byteSize} <= 1048576`),
  ],
);

export type Student = typeof students.$inferSelect;
export type StudentEnrollment = typeof studentEnrollments.$inferSelect;
