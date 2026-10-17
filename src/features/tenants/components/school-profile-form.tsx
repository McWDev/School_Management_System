"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { IDLE, type FormResult } from "@/lib/form-result";
import { SchoolProfileFields, type SchoolProfileValues } from "./school-fields";

export function SchoolProfileForm({
  initial,
  action,
}: {
  initial: SchoolProfileValues;
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert tone="success">{state.message}</FormAlert>}
      <SchoolProfileFields initial={initial} errors={errors} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
