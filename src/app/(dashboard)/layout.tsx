import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGate, CurrentAccountMenu } from "@/components/layout/auth-gate";
import { Skeleton } from "@/components/ui/skeleton";
import Loading from "./loading";

/*
 * The navigation shell is static and renders instantly; everything that
 * depends on the session streams in behind Suspense (Cache Components).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      account={
        <Suspense fallback={<Skeleton className="size-9 rounded-md" />}>
          <CurrentAccountMenu />
        </Suspense>
      }
    >
      <Suspense fallback={<Loading />}>
        <AuthGate>{children}</AuthGate>
      </Suspense>
    </AppShell>
  );
}
