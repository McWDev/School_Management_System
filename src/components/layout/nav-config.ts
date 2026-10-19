import {
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ChartColumn,
  ClipboardList,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Presentation,
  Receipt,
  School,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions/catalog";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Short description shown on the module page header. */
  description: string;
  /**
   * Permission(s) required to see this item — any one of a list is enough;
   * null means every signed-in user. Hiding a menu item is not authorization:
   * pages and actions check on the server.
   */
  permission: Permission | readonly Permission[] | null;
};

export type NavGroup = {
  /** Group heading; null for top-level items without a heading. */
  title: string | null;
  items: NavItem[];
};

/**
 * Every module page with its title, icon and permission. Used for page titles
 * and module placeholders; NOT all of these are shown in the sidebar.
 */
const moduleGroups: NavGroup[] = [
  {
    title: null,
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Overview of your school.",
        permission: null,
      },
      {
        title: "School Staff",
        href: "/staff",
        icon: Users,
        description: "Everyone who works at the school and their work type.",
        permission: "staff.read",
      },
    ],
  },
  {
    title: "Academic",
    items: [
      {
        title: "Classes",
        href: "/classes",
        icon: School,
        description: "All classes of your school and how many students each can hold.",
        permission: "classes.read",
      },
      {
        title: "Students",
        href: "/students",
        icon: GraduationCap,
        description: "Register students and manage their class, guardian and status.",
        permission: "students.read",
      },
      {
        title: "Teachers",
        href: "/teachers",
        icon: Presentation,
        description: "Teacher profiles and class/course assignments.",
        permission: "teachers.read",
      },
      {
        title: "Subjects",
        href: "/subjects",
        icon: BookOpen,
        description: "The subjects taught at your school, used for exams and results.",
        permission: "courses.read",
      },
      {
        title: "Exams",
        href: "/exams",
        icon: ClipboardList,
        description: "Exam setup, marks entry and results.",
        permission: "exams.read",
      },
      {
        title: "Attendance",
        href: "/attendance",
        icon: CalendarCheck,
        description: "Daily attendance by class.",
        permission: "attendance.read",
      },
      {
        title: "Timetable",
        href: "/timetable",
        icon: CalendarClock,
        description: "Weekly class timetables.",
        permission: "timetable.read",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        title: "Student Fees",
        href: "/fees",
        icon: Wallet,
        description: "Charge monthly fees, collect payments and see who still owes.",
        permission: "fees.read",
      },
      {
        title: "Payments",
        href: "/fees/payments",
        icon: Receipt,
        description: "Recorded payments and receipts.",
        permission: "fees.read",
      },
    ],
  },
  {
    title: null,
    items: [
      {
        title: "Reports",
        href: "/reports",
        icon: ChartColumn,
        description: "Filterable reports with print and CSV export.",
        permission: "reports.read",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        title: "Academic Year",
        href: "/academic-years",
        icon: CalendarRange,
        description: "The learning years of your school. One year is Current at a time.",
        permission: "academic_years.read",
      },
      {
        title: "Branches",
        href: "/settings/branches",
        icon: Building2,
        description: "Your school's branches.",
        permission: "branches.read",
      },
      {
        title: "Users",
        href: "/settings/users",
        icon: UserCog,
        description: "User accounts and branch access.",
        permission: "users.manage",
      },
      {
        title: "Roles & Permissions",
        href: "/settings/roles",
        icon: ShieldCheck,
        description: "Roles and the permissions they grant.",
        permission: "roles.manage",
      },
      {
        title: "School Profile",
        href: "/settings/school-profile",
        icon: Landmark,
        description: "Logo, manager, contacts and motto printed on reports and letters.",
        permission: "settings.manage",
      },
      {
        title: "School Registrations",
        href: "/settings/school-registrations",
        icon: ClipboardCheck,
        description: "Schools on the platform and their registration status.",
        // Platform-only permission: school users never see this tab.
        permission: "schools.read",
      },
      {
        title: "General Settings",
        href: "/settings/general",
        icon: SlidersHorizontal,
        description: "Timezone, currency, grading and other preferences.",
        permission: "settings.manage",
      },
    ],
  },
];

export const allNavItems: NavItem[] = moduleGroups.flatMap((group) => group.items);

/**
 * Sidebar tabs, added one at a time as the product owner asks (2026-10-17),
 * in this order: Dashboard, Academic Year, Classes, Subjects, Students, Student Fees,
 * School Staff.
 */
const SIDEBAR_HREFS = [
  "/dashboard",
  "/academic-years",
  "/classes",
  "/subjects",
  "/students",
  "/fees",
  "/staff",
];

export const navGroups: NavGroup[] = [
  {
    title: null,
    items: SIDEBAR_HREFS.map((href) => allNavItems.find((item) => item.href === href)!),
  },
];

export function isNavItemVisible(item: NavItem, permissions: ReadonlySet<string>): boolean {
  if (item.permission === null) return true;
  const required: readonly Permission[] =
    typeof item.permission === "string" ? [item.permission] : item.permission;
  return required.some((key) => permissions.has(key));
}

/** Keep only items the user may see; drop groups left empty. */
export function filterNavGroups(groups: NavGroup[], permissions: ReadonlySet<string>): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isNavItemVisible(item, permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Whether `pathname` is the item's page or one of its sub-pages. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The nav item that best matches `pathname` (longest href wins, so
 * /fees/payments resolves to Payments rather than School Fees).
 */
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return allNavItems
    .filter((item) => isNavItemActive(item, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
