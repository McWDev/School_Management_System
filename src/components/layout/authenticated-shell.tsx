import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenants } from "@/db/schema";
import { redirect } from "next/navigation";
import { findPortalStudent } from "@/features/portal/repository";
import { requireAccess } from "@/lib/authz";
import { AccountMenu } from "./account-menu";
import { AppShell } from "./app-shell";

/**
 * Resolves the signed-in user's access (redirecting to /login when signed out)
 * and renders the shell with permission-filtered navigation. Pages and actions
 * still authorize themselves: layouts and pages render in parallel.
 */
export async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const access = await requireAccess();
  // Students Portal logins have their own area.
  if (access.tenant && access.permissions.size === 0 && (await findPortalStudent(access.user))) {
    redirect("/portal");
  }
  const [school] = access.user.tenantId
    ? await getDb()
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, access.user.tenantId))
    : [];

  return (
    <AppShell
      permissions={[...access.permissions]}
      contextLabel={school?.name ?? "Platform administration"}
      account={
        <AccountMenu
          fullName={access.user.fullName}
          email={access.user.email ?? access.user.username ?? ""}
        />
      }
    >
      {children}
    </AppShell>
  );
}
