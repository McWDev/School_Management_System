import type { Metadata } from "next";
import { GraduationCap, Search } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { resetPortalPasswordAction, setPortalAccessAction } from "@/features/portal/actions";
import { PortalAccessManager } from "@/features/portal/components/portal-access-manager";
import { ensurePortalLogins, listPortalStudents } from "@/features/portal/repository";
import { BackToSettings } from "@/features/settings/components/back-to-settings";
import { getStudentFormOptions } from "@/features/students/repository";
import { getOwnSchool } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Students Portal" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/** Give students their portal logins, reset passwords and turn logins off. */
export default async function StudentsPortalPage({
  searchParams,
}: PageProps<"/settings/students-portal">) {
  const ctx = await getTenantContextFor("students.update");
  if (!ctx || !hasAllBranches(ctx)) return <NoAccess title="Students Portal" />;

  const params = await searchParams;
  const filters = Object.fromEntries(
    Object.entries(params).filter(([, v]) => typeof v === "string" && v !== ""),
  ) as Record<string, string>;
  // Passwords are automatic: Active students without a login get one now.
  await ensurePortalLogins(ctx);
  const [rows, options, school] = await Promise.all([
    listPortalStudents(ctx, filters),
    getStudentFormOptions(ctx),
    getOwnSchool(ctx),
  ]);
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      <BackToSettings />
      <div className="no-print">
        <PageHeader
          title="Students Portal"
          description="Students sign in to see their profile, results and fees. Give them a login here: they sign in with their Student ID and a 6-digit password, which you can see below."
        />
      </div>

      <form role="search" className="no-print flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            type="search"
            defaultValue={filters.search}
            placeholder="Search by name or Student ID"
            aria-label="Search by name or Student ID"
            className="pl-8"
          />
        </div>
        <Select
          name="academicYearId"
          defaultValue={filters.academicYearId ?? ""}
          aria-label="Academic year"
          className="w-auto"
        >
          <option value="">All academic years</option>
          {options.academicYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
        <Select
          name="classId"
          defaultValue={filters.classId ?? ""}
          aria-label="Class"
          className="w-auto"
        >
          <option value="">All classes</option>
          {options.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          name="access"
          defaultValue={filters.access ?? ""}
          aria-label="Portal login"
          className="w-auto"
        >
          <option value="">Any login</option>
          <option value="none">No login yet</option>
          <option value="active">Can sign in</option>
          <option value="disabled">Turned off</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card className="no-print">
          <EmptyState
            icon={GraduationCap}
            title={filtered ? "No students match your filters" : "No students yet"}
            description={
              filtered
                ? "Try a different search, year, class or login."
                : "Register students on the Students page first."
            }
          />
        </Card>
      ) : (
        <PortalAccessManager
          rows={rows}
          schoolName={school.name}
          schoolCode={school.schoolCode}
          reset={resetPortalPasswordAction}
          setAccess={setPortalAccessAction}
        />
      )}
    </>
  );
}
