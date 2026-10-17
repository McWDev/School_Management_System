/*
 * Permission catalog (07-Authentication-Roles-Security.md §3) — the single
 * source of truth. The `permissions` table is seeded from this list by
 * migrations; tests/integration/permissions.test.ts checks they match.
 * Safe to import from client code (no secrets).
 */
export const PERMISSIONS = {
  // Platform (SaaS administration)
  "schools.read": {
    scope: "platform",
    group: "Platform",
    description: "View school registrations",
  },
  "schools.create": { scope: "platform", group: "Platform", description: "Register schools" },
  "schools.update": {
    scope: "platform",
    group: "Platform",
    description: "Edit school registrations",
  },
  "schools.activate": {
    scope: "platform",
    group: "Platform",
    description: "Approve or reactivate schools",
  },
  "schools.suspend": {
    scope: "platform",
    group: "Platform",
    description: "Suspend, reject or archive schools",
  },
  "platform_audit.read": {
    scope: "platform",
    group: "Platform",
    description: "View platform audit log",
  },

  // School
  "dashboard.read": { scope: "tenant", group: "General", description: "View the school dashboard" },
  "branches.read": { scope: "tenant", group: "Settings", description: "View branches" },
  "branches.create": { scope: "tenant", group: "Settings", description: "Create branches" },
  "branches.update": { scope: "tenant", group: "Settings", description: "Edit branches" },
  "branches.archive": {
    scope: "tenant",
    group: "Settings",
    description: "Archive and restore branches",
  },
  "academic_years.read": { scope: "tenant", group: "Settings", description: "View academic years" },
  "academic_years.manage": {
    scope: "tenant",
    group: "Settings",
    description: "Manage academic years",
  },
  "settings.manage": {
    scope: "tenant",
    group: "Settings",
    description: "Manage school profile and settings",
  },
  "users.manage": {
    scope: "tenant",
    group: "Settings",
    description: "Manage users and their access",
  },
  "roles.manage": {
    scope: "tenant",
    group: "Settings",
    description: "Manage roles and permissions",
  },
  "audit_logs.read": {
    scope: "tenant",
    group: "Settings",
    description: "View the school audit log",
  },
  "students.read": { scope: "tenant", group: "Students", description: "View students" },
  "students.create": { scope: "tenant", group: "Students", description: "Admit students" },
  "students.update": { scope: "tenant", group: "Students", description: "Edit students" },
  "students.archive": { scope: "tenant", group: "Students", description: "Archive students" },
  "teachers.read": { scope: "tenant", group: "Teachers", description: "View teachers" },
  "teachers.create": { scope: "tenant", group: "Teachers", description: "Add teachers" },
  "teachers.update": { scope: "tenant", group: "Teachers", description: "Edit teachers" },
  "teachers.archive": { scope: "tenant", group: "Teachers", description: "Archive teachers" },
  "staff.read": { scope: "tenant", group: "Staff", description: "View school staff" },
  "staff.manage": {
    scope: "tenant",
    group: "Staff",
    description: "Add and edit school staff and work types",
  },
  "classes.read": { scope: "tenant", group: "Academic", description: "View classes" },
  "classes.manage": { scope: "tenant", group: "Academic", description: "Manage classes" },
  "courses.read": { scope: "tenant", group: "Academic", description: "View courses and subjects" },
  "courses.manage": {
    scope: "tenant",
    group: "Academic",
    description: "Manage courses and subjects",
  },
  "timetable.read": { scope: "tenant", group: "Academic", description: "View timetables" },
  "timetable.manage": { scope: "tenant", group: "Academic", description: "Manage timetables" },
  "attendance.read": { scope: "tenant", group: "Attendance", description: "View attendance" },
  "attendance.take": { scope: "tenant", group: "Attendance", description: "Take attendance" },
  "attendance.correct": { scope: "tenant", group: "Attendance", description: "Correct attendance" },
  "exams.read": { scope: "tenant", group: "Exams", description: "View exams and results" },
  "exams.manage": { scope: "tenant", group: "Exams", description: "Set up exams" },
  "exams.enter_marks": { scope: "tenant", group: "Exams", description: "Enter marks" },
  "exams.publish_results": { scope: "tenant", group: "Exams", description: "Publish results" },
  "exams.correct_results": {
    scope: "tenant",
    group: "Exams",
    description: "Correct published results",
  },
  "fees.read": { scope: "tenant", group: "Finance", description: "View fees and payments" },
  "fees.manage_structure": {
    scope: "tenant",
    group: "Finance",
    description: "Manage fee structures and charges",
  },
  "fees.record_payment": { scope: "tenant", group: "Finance", description: "Record payments" },
  "fees.reverse_payment": {
    scope: "tenant",
    group: "Finance",
    description: "Reverse or adjust payments",
  },
  "reports.read": { scope: "tenant", group: "Reports", description: "View reports" },
  "reports.export": { scope: "tenant", group: "Reports", description: "Export reports" },
} as const satisfies Record<
  string,
  { scope: "platform" | "tenant"; group: string; description: string }
>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const TENANT_PERMISSIONS = ALL_PERMISSIONS.filter(
  (key) => PERMISSIONS[key].scope === "tenant",
);
export const PLATFORM_PERMISSIONS = ALL_PERMISSIONS.filter(
  (key) => PERMISSIONS[key].scope === "platform",
);

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}
