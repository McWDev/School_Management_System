import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  GraduationCap,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { requireAccess } from "@/lib/authz";
import type { Permission } from "@/lib/permissions/catalog";

export const metadata: Metadata = { title: "School Settings" };

// Depends on the signed-in user's permissions.
export const instant = false;

const SECTIONS: {
  href: string;
  title: string;
  description: string;
  icon: typeof Landmark;
  permission: Permission;
}[] = [
  {
    href: "/settings/general",
    title: "General Settings",
    description: "Exam rules (Midterm, Activities, Final, pass mark) and number prefixes.",
    icon: SlidersHorizontal,
    permission: "settings.manage",
  },
  {
    href: "/settings/school-profile",
    title: "School Profile",
    description: "The letterhead: name, logo, manager, contacts and motto.",
    icon: Landmark,
    permission: "settings.manage",
  },
  {
    href: "/settings/students-portal",
    title: "Students Portal",
    description: "Give students a login to see their profile, results and fees.",
    icon: GraduationCap,
    permission: "students.update",
  },
  {
    href: "/settings/users",
    title: "Users",
    description: "Login accounts and which branches they can use.",
    icon: UserCog,
    permission: "users.manage",
  },
  {
    href: "/settings/roles",
    title: "Roles & Permissions",
    description: "Roles and what each one is allowed to do.",
    icon: ShieldCheck,
    permission: "roles.manage",
  },
];

/** School Settings: the settings sections the signed-in user may open. */
export default async function SchoolSettingsPage() {
  const access = await requireAccess();
  const permissions = access.tenant?.permissions;
  const sections = permissions ? SECTIONS.filter((s) => permissions.has(s.permission)) : [];
  if (sections.length === 0) return <NoAccess title="School Settings" />;

  return (
    <>
      <PageHeader title="School Settings" description="Manage how your school is set up." />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Settings sections">
        {sections.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full items-start gap-3 rounded-lg border bg-surface p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-primary-soft/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="mt-2 size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
