"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type FormState } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(loginAction, {});
  const next = useSearchParams().get("next") ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <FormField id="email" label="Email" error={state.fieldErrors?.email?.[0]}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            defaultValue={state.email}
            autoFocus
          />
        )}
      </FormField>
      <FormField id="password" label="Password" error={state.fieldErrors?.password?.[0]}>
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="current-password" />
        )}
      </FormField>
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/forgot-password"
        className="self-center text-sm text-primary underline-offset-4 hover:underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
