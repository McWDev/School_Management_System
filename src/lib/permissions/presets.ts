import { TENANT_PERMISSIONS, type Permission } from "./catalog";

/*
 * Default role presets (07-Authentication-Roles-Security.md §4). Every new
 * school gets a copy of the school presets; schools may then add custom
 * roles. Branch scope is not part of a role: it is set per user.
 */
export type RolePreset = {
  key: string;
  name: string;
  description: string;
  scope: "platform" | "tenant";
  permissions: readonly Permission[];
  /** Locked presets cannot be edited, so a school can never lock itself out. */
  locked?: boolean;
};

// Staff records are School Admin only (product owner, 2026-10-17).
const readOnly = TENANT_PERMISSIONS.filter((p) => p.endsWith(".read") && p !== "staff.read");

export const PLATFORM_PRESETS: RolePreset[] = [
  {
    key: "platform_super_admin",
    name: "Platform Super Admin",
    description: "Manages school registrations and platform support. No access to school records.",
    scope: "platform",
    permissions: [
      "schools.read",
      "schools.create",
      "schools.update",
      "schools.activate",
      "schools.suspend",
      "platform_audit.read",
    ],
    locked: true,
  },
];

export const SCHOOL_PRESETS: RolePreset[] = [
  {
    key: "school_admin",
    name: "School Admin",
    description: "Full access to the school, its branches, users and settings.",
    scope: "tenant",
    permissions: TENANT_PERMISSIONS,
    locked: true,
  },
  {
    key: "branch_admin",
    name: "Branch Admin",
    description: "Runs day-to-day operations of the branches assigned to them.",
    scope: "tenant",
    permissions: TENANT_PERMISSIONS.filter(
      (p) =>
        ![
          "branches.create",
          "branches.archive",
          "settings.manage",
          "users.manage",
          "roles.manage",
          "academic_years.manage",
          // Staff records are school-wide: School Admin only (product owner, 2026-10-17).
          "staff.read",
          "staff.manage",
        ].includes(p),
    ),
  },
  {
    key: "teacher",
    name: "Teacher",
    description: "Works with assigned classes: attendance and marks.",
    scope: "tenant",
    permissions: [
      "dashboard.read",
      "classes.read",
      "courses.read",
      "students.read",
      "timetable.read",
      "attendance.read",
      "attendance.take",
      "exams.read",
      "exams.enter_marks",
    ],
  },
  {
    key: "finance_officer",
    name: "Finance Officer",
    description: "Manages fees, payments, receipts and finance reports.",
    scope: "tenant",
    permissions: [
      "dashboard.read",
      "students.read",
      "classes.read",
      "branches.read",
      "fees.read",
      "fees.manage_structure",
      "fees.record_payment",
      "fees.reverse_payment",
      "reports.read",
      "reports.export",
    ],
  },
  {
    key: "registrar",
    name: "Registrar",
    description: "Manages students, enrollments, classes, courses and academic setup.",
    scope: "tenant",
    permissions: [
      "dashboard.read",
      "branches.read",
      "academic_years.read",
      "academic_years.manage",
      "students.read",
      "students.create",
      "students.update",
      "students.archive",
      "teachers.read",
      "classes.read",
      "classes.manage",
      "courses.read",
      "courses.manage",
      "timetable.read",
      "timetable.manage",
      "reports.read",
    ],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Read-only access to records, reports and the audit log.",
    scope: "tenant",
    permissions: readOnly,
  },
];
