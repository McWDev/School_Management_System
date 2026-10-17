import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/form-alert";

export const metadata: Metadata = { title: "Forgot password" };

/*
 * Email delivery is not configured yet (07-Authentication-Roles-Security.md):
 * instead of pretending to send an email, explain the supported path. An
 * administrator generates a single-use reset link for the user.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Forgot your password?</h1>
      <FormAlert tone="success" className="bg-primary-soft text-primary">
        Password reset by email is not available yet.
      </FormAlert>
      <p className="text-sm text-muted-foreground">
        Ask your school administrator to create a password reset link for you. School administrators
        can contact platform support. Reset links work once and expire after 30 minutes.
      </p>
      <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
