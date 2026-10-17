import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { AccountMenu } from "./account-menu";

/**
 * Renders children only for a valid session; otherwise redirects to /login.
 * Pages and actions that touch data must still call requireUser() themselves,
 * because layouts and pages render in parallel.
 */
export async function AuthGate({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}

export async function CurrentAccountMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <AccountMenu fullName={user.fullName} email={user.email} />;
}
