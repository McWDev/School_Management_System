import type { Metadata } from "next";
import { School } from "lucide-react";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { Pagination } from "@/components/data-table/pagination";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  updateOwnSchoolAction,
} from "@/features/tenants/actions";
import { RegisterSchoolDialog } from "@/features/tenants/components/register-school-dialog";
import { SchoolAdminDialog } from "@/features/tenants/components/school-admin-dialog";
import { SchoolProfileForm } from "@/features/tenants/components/school-profile-form";
import { getOwnSchool, listSchools } from "@/features/tenants/repository";
import { requireAccess } from "@/lib/authz";
import {
  can,
  hasAllBranches,
  type PlatformContext,
  type TenantContext,
} from "@/lib/tenant-context";

export const metadata: Metadata = { title: "School Profile" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/*
 * School Profile and School Registrations on one page (02-Product-Decisions.md):
 * platform users manage every school's registration; school users see their
 * own registration and edit their profile.
 */
export default async function SchoolProfilePage({
  searchParams,
}: PageProps<"/settings/school-profile">) {
  const access = await requireAccess();
  if (access.platform && can(access.platform, "schools.read")) {
    return <SchoolRegistrations ctx={access.platform} searchParams={await searchParams} />;
  }
  if (access.tenant && can(access.tenant, "settings.manage")) {
    return <OwnSchoolProfile ctx={access.tenant} />;
  }
  return <NoAccess title="School Profile" />;
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";
}

// --------------------------------------------------------------- school view

async function OwnSchoolProfile({ ctx }: { ctx: TenantContext }) {
  const school = await getOwnSchool(ctx);
  const canEdit = hasAllBranches(ctx);
  return (
    <>
      <PageHeader
        title="School Profile"
        description="Your school's registration and contact details."
      />
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>
            Managed by the platform. Contact support to change these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">School code</dt>
              <dd className="font-mono">{school.schoolCode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={school.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Registered</dt>
              <dd>{formatDate(school.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status changed</dt>
              <dd>{formatDate(school.statusChangedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Shown on receipts, reports and printouts.</CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <SchoolProfileForm initial={school} action={updateOwnSchoolAction} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only users with access to all branches can edit the school profile.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ------------------------------------------------------------- platform view

async function SchoolRegistrations({
  ctx,
  searchParams,
}: {
  ctx: PlatformContext;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const page = await listSchools(ctx, { search, status }, { page: searchParams.page });
  const canActivate = can(ctx, "schools.activate");
  const canSuspend = can(ctx, "schools.suspend");
  const canAddAdmin = can(ctx, "schools.update");

  return (
    <>
      <PageHeader
        title="School Profile"
        description="School registrations on the platform: approve new schools and manage their status."
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
          <Pagination page={page} basePath="/settings/school-profile" params={{ search, status }} />
        </>
      )}
    </>
  );
}
