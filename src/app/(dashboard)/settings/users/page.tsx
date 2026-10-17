import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { Pagination } from "@/components/data-table/pagination";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
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
import { listBranchOptions } from "@/features/branches/repository";
import { listRoles } from "@/features/roles/repository";
import {
  createUserAction,
  disableUserAction,
  enableUserAction,
  resetLinkAction,
  updateUserAction,
} from "@/features/users/actions";
import { ResetLinkDialog } from "@/features/users/components/reset-link-dialog";
import { UserFormDialog } from "@/features/users/components/user-form-dialog";
import { listSchoolUsers } from "@/features/users/repository";
import { getTenantContextFor } from "@/lib/authz";
import { hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Users" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const ctx = await getTenantContextFor("users.manage");
  if (!ctx || !hasAllBranches(ctx)) return <NoAccess title="Users" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const [page, roles, branches] = await Promise.all([
    listSchoolUsers(ctx, { search, status }, { page: params.page }),
    listRoles(ctx),
    listBranchOptions(ctx),
  ]);
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name, description: r.description }));
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can sign in to your school, their roles and branches."
      />
      <ListToolbar
        search={search}
        status={status}
        searchPlaceholder="Search by name or email"
        statusOptions={[
          { value: "active", label: "Active" },
          { value: "disabled", label: "Disabled" },
        ]}
      >
        <UserFormDialog
          mode="create"
          roles={roleOptions}
          branches={branchOptions}
          action={createUserAction}
        />
      </ListToolbar>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={UserCog}
            title="No users match your filters"
            description="Try a different search or status."
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="hidden lg:table-cell">Branches</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((user) => {
                const isSelf = user.id === ctx.actorUserId;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="block font-medium">
                        {user.fullName}
                        {isSelf && <span className="text-muted-foreground"> (you)</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {user.email ?? "No email (signs in with a username)"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length ? (
                          user.roles.map((role) => (
                            <Badge key={role.id} tone="primary">
                              {role.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">No role</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {user.allBranches
                        ? "All branches"
                        : user.branches.map((b) => b.name).join(", ") || "None"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {user.status === "active" && (
                          <UserFormDialog
                            mode="edit"
                            roles={roleOptions}
                            branches={branchOptions}
                            initial={{
                              fullName: user.fullName,
                              email: user.email ?? "",
                              roleIds: user.roles.map((r) => r.id),
                              allBranches: user.allBranches,
                              branchIds: user.branches.map((b) => b.id),
                            }}
                            action={updateUserAction.bind(null, user.id)}
                          />
                        )}
                        {user.status === "active" && (
                          <ResetLinkDialog
                            userName={user.fullName}
                            action={resetLinkAction.bind(null, user.id)}
                          />
                        )}
                        {!isSelf && user.status === "active" && (
                          <ConfirmAction
                            label="Disable"
                            title={`Disable ${user.fullName}?`}
                            description="They are signed out everywhere immediately and cannot sign in until enabled again. Their records and history are kept."
                            confirmLabel="Disable user"
                            variant="destructive"
                            action={disableUserAction.bind(null, user.id)}
                          />
                        )}
                        {user.status === "disabled" && (
                          <ConfirmAction
                            label="Enable"
                            title={`Enable ${user.fullName}?`}
                            description="They can sign in again with their existing password."
                            confirmLabel="Enable user"
                            action={enableUserAction.bind(null, user.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} basePath="/settings/users" params={{ search, status }} />
        </>
      )}
    </>
  );
}
