"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { OneTimeLink } from "@/components/forms/one-time-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import type { SchoolLinkResult } from "../actions";
import { SchoolDetailFields } from "./school-fields";

type Action = (
  prev: FormResult<unknown>,
  formData: FormData,
) => Promise<FormResult<SchoolLinkResult>>;

export function RegisterSchoolDialog({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>Register school</Button>
      </DialogTrigger>
      <DialogContent
        title="Register school"
        description="New schools start as pending until you approve them."
        className="max-w-2xl"
      >
        <RegisterSchoolForm key={formKey} action={action} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RegisterSchoolForm({ action, onDone }: { action: Action; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(action, IDLE as FormResult<SchoolLinkResult>);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        {state.data ? (
          <OneTimeLink
            url={state.data.url}
            expiresAt={state.data.expiresAt}
            intro="School registered. Give this setup link to the School Admin."
          />
        ) : (
          <FormAlert tone="success">School registered. It is pending approval.</FormAlert>
        )}
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <FormField
        id="register-code"
        label="School code"
        required
        helperText="Unique short code, e.g. HODAN-01. Cannot be changed later."
        error={errors.schoolCode?.[0]}
      >
        {(props) => <Input {...props} name="schoolCode" maxLength={20} className="uppercase" />}
      </FormField>
      <SchoolDetailFields idPrefix="register" errors={errors} />
      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">First School Admin (optional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="register-admin-name" label="Full name" error={errors.fullName?.[0]}>
            {(props) => <Input {...props} name="adminName" />}
          </FormField>
          <FormField id="register-admin-email" label="Email" error={errors.email?.[0]}>
            {(props) => <Input {...props} name="adminEmail" type="email" autoComplete="off" />}
          </FormField>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Registering…" : "Register school"}
        </Button>
      </div>
    </form>
  );
}
