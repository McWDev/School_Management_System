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

type Action = (
  prev: FormResult<unknown>,
  formData: FormData,
) => Promise<FormResult<SchoolLinkResult>>;

export function SchoolAdminDialog({ schoolName, action }: { schoolName: string; action: Action }) {
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
        <Button variant="outline" size="sm">
          Add admin
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Add School Admin — ${schoolName}`}
        description="The admin gets full access to this school and sets a password with a one-time link."
      >
        <SchoolAdminForm key={formKey} action={action} />
      </DialogContent>
    </Dialog>
  );
}

function SchoolAdminForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, IDLE as FormResult<SchoolLinkResult>);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  if (state.status === "success" && state.data) {
    return (
      <OneTimeLink
        url={state.data.url}
        expiresAt={state.data.expiresAt}
        intro="School Admin created. Give them this setup link."
      />
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <FormField id="school-admin-name" label="Full name" required error={errors.fullName?.[0]}>
        {(props) => <Input {...props} name="fullName" />}
      </FormField>
      <FormField id="school-admin-email" label="Email" required error={errors.email?.[0]}>
        {(props) => <Input {...props} name="email" type="email" autoComplete="off" />}
      </FormField>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create admin"}
        </Button>
      </div>
    </form>
  );
}
