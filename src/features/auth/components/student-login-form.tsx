"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studentLoginAction, type FormState } from "../actions";

/** Students Portal sign-in: school code (filled from the slip link), Student ID, 6-digit password. */
export function StudentLoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(studentLoginAction, {});
  const school = useSearchParams().get("school") ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <FormField id="school-code" label="School code" error={state.fieldErrors?.schoolCode?.[0]}>
        {(props) => (
          <Input
            {...props}
            name="schoolCode"
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={state.schoolCode ?? school}
          />
        )}
      </FormField>
      <FormField id="student-id" label="Student ID" error={state.fieldErrors?.studentId?.[0]}>
        {(props) => (
          <Input
            {...props}
            name="studentId"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. STU-0001"
            defaultValue={state.email}
            autoFocus
          />
        )}
      </FormField>
      <FormField id="password" label="Password" error={state.fieldErrors?.password?.[0]}>
        {(props) => (
          <Input
            {...props}
            name="password"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="current-password"
          />
        )}
      </FormField>
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/login"
        className="self-center text-sm text-primary underline-offset-4 hover:underline"
      >
        Staff sign in
      </Link>
    </form>
  );
}
