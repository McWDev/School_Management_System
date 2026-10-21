"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";

/** Change your own password: the current one, then the new one twice. */
export function ChangePasswordForm({
  action,
}: {
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    // Passwords are not kept after an error (the form resets on purpose).
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-soft p-3 text-sm font-medium"
        >
          {state.message} Use it next time you sign in.
        </p>
      )}
      <FormField
        id="current-password"
        label="Current password"
        required
        error={errors.currentPassword?.[0]}
      >
        {(p) => (
          <Input {...p} name="currentPassword" type="password" autoComplete="current-password" />
        )}
      </FormField>
      <FormField
        id="new-password"
        label="New password"
        required
        helperText="Exactly 6 digits."
        error={errors.newPassword?.[0]}
      >
        {(p) => (
          <Input
            {...p}
            name="newPassword"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
          />
        )}
      </FormField>
      <FormField
        id="confirm-password"
        label="New password again"
        required
        error={errors.confirmPassword?.[0]}
      >
        {(p) => (
          <Input
            {...p}
            name="confirmPassword"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
          />
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
