import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createRoleAction, updateRoleAction } from "@/features/roles/actions";
import { RoleFormDialog } from "@/features/roles/components/role-form-dialog";
import { listRoles } from "@/features/roles/repository";
import { getTenantContextFor } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { hasAllBranches } from "@/lib/tenant-context";
import { BackToSettings } from "@/features/settings/components/back-to-settings";

export const metadata: Metadata = { title: "Roles & Permissions" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

export default async function RolesPage() {
  const ctx = await getTenantContextFor("roles.manage");
  if (!ctx || !hasAllBranches(ctx)) return <NoAccess title="Roles & Permissions" />;
  const roles = await listRoles(ctx);

  return (
    <>
      <BackToSettings />
      <PageHeader
        title="Roles & Permissions"
        description="Roles decide what people can do. Which branches they can see is set per user."
        actions={<RoleFormDialog mode="create" action={createRoleAction} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const groups = new Map<string, string[]>();
          for (const key of role.permissions) {
            const meta = PERMISSIONS[key];
            if (!meta) continue;
            groups.set(meta.group, [...(groups.get(meta.group) ?? []), meta.description]);
          }
          return (
            <Card key={role.id}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {role.name}
                    {role.presetKey && <Badge tone="neutral">Built-in</Badge>}
                    {role.locked && (
                      <Badge tone="warning">
                        <Lock className="size-3" aria-hidden="true" /> Locked
                      </Badge>
                    )}
                  </CardTitle>
                  {role.description && <CardDescription>{role.description}</CardDescription>}
                  <p className="text-xs text-muted-foreground">
                    {role.userCount} {role.userCount === 1 ? "user" : "users"} ·{" "}
                    {role.permissions.length} permissions
                  </p>
                </div>
                {!role.locked && (
                  <RoleFormDialog
                    mode="edit"
                    initial={{
                      name: role.name,
                      description: role.description,
                      permissions: role.permissions,
                    }}
                    action={updateRoleAction.bind(null, role.id)}
                  />
                )}
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm text-primary">
                    Show permissions
                  </summary>
                  <dl className="mt-3 grid gap-2 text-sm">
                    {[...groups.entries()].map(([group, items]) => (
                      <div key={group}>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group}
                        </dt>
                        <dd>{items.join(", ")}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
