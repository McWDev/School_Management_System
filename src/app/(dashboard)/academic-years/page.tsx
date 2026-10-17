import type { Metadata } from "next";
import { CalendarRange, Search } from "lucide-react";
import { Pagination } from "@/components/data-table/pagination";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createAcademicYearAction,
  deleteAcademicYearAction,
  makeAcademicYearCurrentAction,
  updateAcademicYearAction,
} from "@/features/academic-years/actions";
import { AcademicYearFormDialog } from "@/features/academic-years/components/academic-year-form-dialog";
import { listAcademicYears } from "@/features/academic-years/repository";
import {
  ACADEMIC_YEAR_STATUSES,
  academicYearStatusLabels,
} from "@/features/academic-years/schemas";
import { getTenantContextFor } from "@/lib/authz";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Academic Year" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

const statusTone = { current: "success", upcoming: "primary", closed: "neutral" } as const;

export default async function AcademicYearsPage({ searchParams }: PageProps<"/academic-years">) {
  const ctx = await getTenantContextFor("academic_years.read");
  if (!ctx) return <NoAccess title="Academic Year" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = await listAcademicYears(ctx, { search, status }, { page: params.page });
  const canManage = can(ctx, "academic_years.manage") && hasAllBranches(ctx);
  const filtered = Boolean(search || status);

  return (
    <>
      <PageHeader
        title="Academic Year"
        description="The learning years of your school. One year is Current at a time."
        actions={
          canManage && <AcademicYearFormDialog mode="create" action={createAcademicYearAction} />
        }
      />

      <form role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            type="search"
            defaultValue={search}
            placeholder="Search by academic year"
            aria-label="Search by academic year"
            className="pl-8"
          />
        </div>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">All statuses</option>
          {ACADEMIC_YEAR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {academicYearStatusLabels[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarRange}
            title={filtered ? "No academic years match your filters" : "No academic years yet"}
            description={
              filtered
                ? "Try a different search or status."
                : canManage
                  ? "Add your first academic year with “Add academic year” and make it Current."
                  : "No academic years have been added yet."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Academic year</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge tone={statusTone[item.status]}>
                      {academicYearStatusLabels[item.status]}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.status !== "current" && (
                          <ConfirmAction
                            label="Make current"
                            title={`Make ${item.name} the current year?`}
                            description="The year that is Current now will be set to Closed."
                            confirmLabel="Make current"
                            action={makeAcademicYearCurrentAction.bind(null, item.id)}
                          />
                        )}
                        <AcademicYearFormDialog
                          mode="edit"
                          initial={item}
                          action={updateAcademicYearAction.bind(null, item.id)}
                        />
                        <ConfirmAction
                          label="Delete"
                          title={`Delete ${item.name}?`}
                          description={`This permanently deletes the academic year ${item.name}. This cannot be undone. To keep it on record, set it to Closed instead.`}
                          confirmLabel="Delete academic year"
                          variant="destructive"
                          action={deleteAcademicYearAction.bind(null, item.id)}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} basePath="/academic-years" params={{ search, status }} />
        </>
      )}
    </>
  );
}
