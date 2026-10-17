import type { Metadata } from "next";
import { School, Search } from "lucide-react";
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
  createClassAction,
  deleteClassAction,
  updateClassAction,
} from "@/features/classes/actions";
import { ClassFormDialog } from "@/features/classes/components/class-form-dialog";
import { listClasses } from "@/features/classes/repository";
import { getTenantContextFor } from "@/lib/authz";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Classes" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const ctx = await getTenantContextFor("classes.read");
  if (!ctx) return <NoAccess title="Classes" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = await listClasses(ctx, { search, status }, { page: params.page });
  const canManage = can(ctx, "classes.manage") && hasAllBranches(ctx);
  const filtered = Boolean(search || status);

  return (
    <>
      <PageHeader
        title="Classes"
        description="All classes of your school and how many students each can hold."
        actions={canManage && <ClassFormDialog mode="create" action={createClassAction} />}
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
            placeholder="Search by class name"
            aria-label="Search by class name"
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
            icon={School}
            title={filtered ? "No classes match your filters" : "No classes yet"}
            description={
              filtered
                ? "Try a different search or status."
                : canManage
                  ? "Add your first class with “Add class”."
                  : "No classes have been added yet."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Seats</TableHead>
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
                  <TableCell className="tabular-nums">
                    {item.seats} {item.seats === 1 ? "seat" : "seats"}
                  </TableCell>
                  <TableCell>
                    <Badge tone={item.status === "active" ? "success" : "warning"}>
                      {item.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <ClassFormDialog
                          mode="edit"
                          initial={item}
                          action={updateClassAction.bind(null, item.id)}
                        />
                        <ConfirmAction
                          label="Delete"
                          title={`Delete ${item.name}?`}
                          description={`This permanently deletes the class ${item.name}. This cannot be undone. To keep it on record, set it to Inactive instead.`}
                          confirmLabel="Delete class"
                          variant="destructive"
                          action={deleteClassAction.bind(null, item.id)}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} basePath="/classes" params={{ search, status }} />
        </>
      )}
    </>
  );
}
