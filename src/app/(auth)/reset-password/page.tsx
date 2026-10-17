import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  // Reset links carry a token in the URL: never send it to other sites.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a password you have not used here before.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
