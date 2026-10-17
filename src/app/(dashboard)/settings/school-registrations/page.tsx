import type { Metadata } from "next";
import { School } from "lucide-react";
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
  changeSchoolStatusAction,
  createSchoolAdminAction,
  registerSchoolAction,
} from "@/features/tenants/actions";
import { RegisterSchoolDialog } from "@/features/tenants/components/register-school-dialog";
import { SchoolAdminDialog } from "@/features/tenants/components/school-admin-dialog";
import { listSchools } from "@/features/tenants/repository";
import { getPlatformContextFor } from "@/lib/authz";
import { can } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "School Registrations" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";
}

/** Platform only: every school on the platform and its registration status. */
export default async function SchoolRegistrationsPage({
  searchParams,
}: PageProps<"/settings/school-registrations">) {
  const ctx = await getPlatformContextFor("schools.read");
  if (!ctx) return <NoAccess title="School Registrations" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = await listSchools(ctx, { search, status }, { page: params.page });
  const canActivate = can(ctx, "schools.activate");
  const canSuspend = can(ctx, "schools.suspend");
  const canAddAdmin = can(ctx, "schools.update");

  return (
    <>
      <PageHeader
        title="School Registrations"
        description="Schools on the platform: approve new schools and manage their status."
      />
      <ListToolbar
        search={search}
        status={status}
        searchPlaceholder="Search by name or code"
        statusOptions={[
          { value: "pending", label: "Pending" },
          { value: "active", label: "Active" },
          { value: "suspended", label: "Suspended" },
          { value: "archived", label: "Archived" },
        ]}
      >
        {can(ctx, "schools.create") && <RegisterSchoolDialog action={registerSchoolAction} />}
      </ListToolbar>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={School}
            title={search || status ? "No schools match your filters" : "No schools registered yet"}
            description={
              search || status ? "Try a different search or status." : "Register the first school."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead className="hidden md:table-cell">Registered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((school) => {
                const act = (action: Parameters<typeof changeSchoolStatusAction>[1]) =>
                  changeSchoolStatusAction.bind(null, school.id, action);
                return (
                  <TableRow key={school.id}>
                    <TableCell>
                      <span className="block font-medium">{school.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {school.schoolCode}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(school.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={school.status} />
                      {school.statusReason && (
                        <span className="mt-1 block max-w-xs truncate text-xs text-muted-foreground">
                          {school.statusReason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {canActivate && school.status === "pending" && (
                          <ConfirmAction
                            label="Approve"
                            title={`Approve ${school.name}?`}
                            description="The school becomes active and its users can sign in."
                            confirmLabel="Approve school"
                            action={act("approve")}
                          />
                        )}
                        {canSuspend && school.status === "pending" && (
                          <ConfirmAction
                            label="Reject"
                            title={`Reject ${school.name}?`}
                            description="The registration is archived and the school cannot be used."
                            confirmLabel="Reject registration"
                            variant="destructive"
                            reason="required"
                            action={act("reject")}
                          />
                        )}
                        {canSuspend && school.status === "active" && (
                          <ConfirmAction
                            label="Suspend"
                            title={`Suspend ${school.name}?`}
                            description="All users of this school are signed out immediately and cannot sign in until it is reactivated. No data is deleted."
                            confirmLabel="Suspend school"
                            variant="destructive"
                            reason="required"
                            action={act("suspend")}
                          />
                        )}
                        {canActivate && school.status === "suspended" && (
                          <ConfirmAction
                            label="Reactivate"
                            title={`Reactivate ${school.name}?`}
                            description="Users of this school can sign in again."
                            confirmLabel="Reactivate school"
                            action={act("reactivate")}
                          />
                        )}
                        {canSuspend && school.status === "suspended" && (
                          <ConfirmAction
                            label="Archive"
                            title={`Archive ${school.name}?`}
                            description="Archiving is final: the school can no longer be reactivated. Its records are kept."
                            confirmLabel="Archive school"
                            variant="destructive"
                            reason="required"
                            action={act("archive")}
                          />
                        )}
                        {canAddAdmin && school.status !== "archived" && (
                          <SchoolAdminDialog
                            schoolName={school.name}
                            action={createSchoolAdminAction.bind(null, school.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            basePath="/settings/school-registrations"
            params={{ search, status }}
          />
        </>
      )}
    </>
  );
}
