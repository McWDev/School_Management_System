import { Suspense } from "react";
import { PortalShell } from "@/features/portal/components/portal-shell";

/*
 * Students Portal: a separate, simple area for students (their own profile,
 * results, fees and password). The shell checks the signed-in user is a
 * portal student; everyone else is sent to the dashboard.
 */
export const instant = false;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<div className="min-h-dvh bg-background" aria-busy="true" aria-label="Loading" />}
    >
      <PortalShell>{children}</PortalShell>
    </Suspense>
  );
}
