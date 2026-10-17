import { Suspense } from "react";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";

/*
 * Navigation depends on the user's permissions, so the whole shell streams in
 * behind Suspense once the session is validated (Cache Components). Entering
 * this area always validates the session first, so navigations into it block;
 * data pages also opt out individually (instant = false).
 */
export const instant = false;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
