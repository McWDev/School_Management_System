"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction, type FormState } from "../actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const token = useSearchParams().get("token") ?? "";

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">
          Your password has been changed. You have been signed out everywhere.
        </FormAlert>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (!token) {
    return (
      <FormAlert>
        This page needs a reset link. Ask your administrator for a new password reset link.
      </FormAlert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <FormField
        id="password"
        label="New password"
        helperText="At least 10 characters."
        error={state.fieldErrors?.password?.[0]}
      >
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="new-password" />
        )}
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        error={state.fieldErrors?.confirmPassword?.[0]}
      >
        {(props) => (
          <Input {...props} name="confirmPassword" type="password" autoComplete="new-password" />
        )}
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
