import type { Metadata } from "next";
import { BookOpen, Search } from "lucide-react";
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
  assignTeacherAction,
  createSubjectAction,
  deleteSubjectAction,
  updateSubjectAction,
} from "@/features/subjects/actions";
import { AssignTeacherDialog } from "@/features/subjects/components/assign-teacher-dialog";
import { SubjectFormDialog } from "@/features/subjects/components/subject-form-dialog";
import { listSubjects, listTeacherOptions } from "@/features/subjects/repository";
import { getTenantContextFor } from "@/lib/authz";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Subjects" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

export default async function SubjectsPage({ searchParams }: PageProps<"/subjects">) {
  const ctx = await getTenantContextFor("courses.read");
  if (!ctx) return <NoAccess title="Subjects" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const canManage = can(ctx, "courses.manage") && hasAllBranches(ctx);
  const [page, teachers] = await Promise.all([
    listSubjects(ctx, { search, status }, { page: params.page }),
    canManage ? listTeacherOptions(ctx) : [],
  ]);
  const filtered = Boolean(search || status);

  return (
    <>
      <PageHeader
        title="Subjects"
        description="The subjects taught at your school, used for exams and results."
        actions={canManage && <SubjectFormDialog mode="create" action={createSubjectAction} />}
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
            placeholder="Search by name or code"
            aria-label="Search by name or code"
            className="pl-8"
          />
        </div>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={filtered ? "No subjects match your filters" : "No subjects yet"}
            description={
              filtered
                ? "Try a different search or status."
                : canManage
                  ? "Add your first subject with “Add subject”, e.g. Mathematics."
                  : "No subjects have been added yet."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Teacher</TableHead>
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
                  <TableCell className="tabular-nums">{item.code}</TableCell>
                  <TableCell>
                    {item.teacherName ?? (
                      <span className="text-muted-foreground">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={item.status === "active" ? "success" : "warning"}>
                      {item.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <AssignTeacherDialog
                          subjectName={item.name}
                          currentStaffId={item.teacherStaffId}
                          currentTeacherName={item.teacherName}
                          teachers={teachers}
                          action={assignTeacherAction.bind(null, item.id)}
                        />
                        <SubjectFormDialog
                          mode="edit"
                          initial={item}
                          action={updateSubjectAction.bind(null, item.id)}
                        />
                        <ConfirmAction
                          label="Delete"
                          title={`Delete ${item.name}?`}
                          description={`This permanently deletes the subject ${item.name}. This cannot be undone. To keep it on record, set it to Inactive instead.`}
                          confirmLabel="Delete subject"
                          variant="destructive"
                          action={deleteSubjectAction.bind(null, item.id)}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} basePath="/subjects" params={{ search, status }} />
        </>
      )}
    </>
  );
}
