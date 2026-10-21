import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { Pagination } from "@/components/data-table/pagination";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  archiveBranchAction,
  createBranchAction,
  restoreBranchAction,
  updateBranchAction,
} from "@/features/branches/actions";
import { BranchFormDialog } from "@/features/branches/components/branch-form-dialog";
import { listBranches } from "@/features/branches/repository";
import { getTenantContextFor } from "@/lib/authz";
import { can, hasAllBranches } from "@/lib/tenant-context";
import { BackToSettings } from "@/features/settings/components/back-to-settings";

export const metadata: Metadata = { title: "Branches" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

export default async function BranchesPage({ searchParams }: PageProps<"/settings/branches">) {
  const ctx = await getTenantContextFor("branches.read");
  if (!ctx) return <NoAccess title="Branches" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = await listBranches(ctx, { search, status }, { page: params.page });

  const canCreate = can(ctx, "branches.create") && hasAllBranches(ctx);
  const canUpdate = can(ctx, "branches.update");
  const canArchive = can(ctx, "branches.archive") && hasAllBranches(ctx);

  return (
    <>
      <BackToSettings />
      <PageHeader title="Branches" description="Campuses and locations of your school." />
      <ListToolbar
        search={search}
        status={status}
        searchPlaceholder="Search by name or code"
        statusOptions={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      >
        {canCreate && <BranchFormDialog mode="create" action={createBranchAction} />}
      </ListToolbar>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={search || status ? "No branches match your filters" : "No branches yet"}
            description={
              search || status
                ? "Try a different search or status."
                : canCreate
                  ? "Add your first branch to start registering classes and students."
                  : "No branches are available to you."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead>Status</TableHead>
                {(canUpdate || canArchive) && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-mono text-xs">{branch.branchCode}</TableCell>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {[branch.phone, branch.email].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={branch.status} />
                  </TableCell>
                  {(canUpdate || canArchive) && (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canUpdate && branch.status === "active" && (
                          <BranchFormDialog
                            mode="edit"
                            initial={branch}
                            action={updateBranchAction.bind(null, branch.id)}
                          />
                        )}
                        {canArchive && branch.status === "active" && (
                          <ConfirmAction
                            label="Archive"
                            title={`Archive ${branch.name}?`}
                            description="Archived branches keep all their history but cannot be used for new classes, students or payments. You can restore it later."
                            confirmLabel="Archive branch"
                            variant="destructive"
                            action={archiveBranchAction.bind(null, branch.id)}
                          />
                        )}
                        {canArchive && branch.status === "archived" && (
                          <ConfirmAction
                            label="Restore"
                            title={`Restore ${branch.name}?`}
                            description="The branch becomes active again and can be used for new records."
                            confirmLabel="Restore branch"
                            action={restoreBranchAction.bind(null, branch.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} basePath="/settings/branches" params={{ search, status }} />
        </>
      )}
    </>
  );
}
