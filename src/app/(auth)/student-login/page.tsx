import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentLoginForm } from "@/features/auth/components/student-login-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Student sign in" };

/** Signed-in visitors go straight on (students land on their portal). */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/dashboard");
  return null;
}

export default function StudentLoginPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Student sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use your Student ID and the 6-digit password from your school.
        </p>
      </div>
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <StudentLoginForm />
      </Suspense>
    </div>
  );
}
