import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

/** Signed-in visitors go straight to the dashboard. */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/dashboard");
  return null;
}

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use the email and password for your account.
        </p>
      </div>
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
