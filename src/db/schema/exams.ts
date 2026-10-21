import { sql } from "drizzle-orm";
import { check, foreignKey, index, numeric, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { academicYears } from "./academic-years";
import { users } from "./auth";
import { classes } from "./classes";
import { students } from "./students";
import { subjects } from "./subjects";
import { tenants } from "./tenants";

/*
 * Examination marks (step 8, product owner 2026-10-19): choose the class, then
 * the subject, and fill each student's Midterm, Activities and Final (by
 * default out of 30, 20 and 50; each school can change them in General
 * Settings). The subject total is out of 100; a student's average over the
 * subjects decides Pass (the school's pass mark, default 50) or Fail.
 */
export const subjectMarks = pgTable(
  "subject_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    academicYearId: uuid("academic_year_id").notNull(),
    /** The class the student had when marked. */
    classId: uuid("class_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    studentId: uuid("student_id").notNull(),
    /** Out of the school's Midterm maximum; null until entered. */
    midterm: numeric("midterm", { precision: 5, scale: 2 }),
    /** Out of the school's Activities maximum; null until entered. */
    activities: numeric("activities", { precision: 5, scale: 2 }),
    /** Out of the school's Final maximum; null until entered. */
    final: numeric("final", { precision: 5, scale: 2 }),
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "subject_marks_year_fk",
      columns: [table.tenantId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "subject_marks_class_fk",
      columns: [table.tenantId, table.classId],
      foreignColumns: [classes.tenantId, classes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "subject_marks_subject_fk",
      columns: [table.tenantId, table.subjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }).onDelete("restrict"),
    // Academic history: a student with marks cannot be deleted.
    foreignKey({
      name: "subject_marks_student_fk",
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    }).onDelete("restrict"),
    unique("subject_marks_student_subject_year_unique").on(
      table.studentId,
      table.subjectId,
      table.academicYearId,
    ),
    index("subject_marks_class_year_idx").on(table.tenantId, table.classId, table.academicYearId),
    index("subject_marks_subject_idx").on(table.subjectId),
    // Each school sets the maximum of each part (General Settings); checked on the server.
    check(
      "subject_marks_parts_range",
      sql`${table.midterm} between 0 and 100 and ${table.activities} between 0 and 100 and ${table.final} between 0 and 100`,
    ),
  ],
);

export type SubjectMark = typeof subjectMarks.$inferSelect;
