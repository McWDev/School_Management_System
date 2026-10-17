"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { OneTimeLink } from "@/components/forms/one-time-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";

type Option = { id: string; name: string; description?: string | null };

type Props = {
  mode: "create" | "edit";
  roles: Option[];
  branches: Option[];
  initial?: {
    fullName: string;
    email: string;
    roleIds: string[];
    allBranches: boolean;
    branchIds: string[];
  };
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

export function UserFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  // A new key remounts the form, so a one-time link is never shown twice.
  const [formKey, setFormKey] = useState(0);
  const { mode, initial } = props;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((key) => key + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={mode === "create" ? "primary" : "outline"}
          size={mode === "create" ? "md" : "sm"}
        >
          {mode === "create" ? "Add user" : "Edit access"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Add user" : `Edit ${initial?.fullName}`}
        description={
          mode === "create"
            ? "The user sets their own password with a one-time setup link."
            : "Roles decide what this user can do; branches decide where."
        }
        className="max-w-2xl"
      >
        <UserFormBody key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UserFormBody({
  mode,
  roles,
  branches,
  initial,
  action,
  onSaved,
}: Props & { onSaved: () => void }) {
  const [allBranches, setAllBranches] = useState(initial?.allBranches ?? false);
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success" && mode === "edit") onSaved();
      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.status === "success" && mode === "create") {
    const link = state.data as { url: string; expiresAt: string };
    return (
      <div className="flex flex-col gap-4">
        <OneTimeLink
          url={link.url}
          expiresAt={link.expiresAt}
          intro="User created. Give them this setup link so they can choose a password."
        />
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${mode}-user-name`} label="Full name" required error={errors.fullName?.[0]}>
          {(fieldProps) => (
            <Input {...fieldProps} name="fullName" defaultValue={initial?.fullName} />
          )}
        </FormField>
        {mode === "create" ? (
          <FormField id="create-user-email" label="Email" required error={errors.email?.[0]}>
            {(fieldProps) => <Input {...fieldProps} name="email" type="email" autoComplete="off" />}
          </FormField>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <span className="text-sm text-muted-foreground">{initial?.email}</span>
          </div>
        )}
      </div>
      <CheckboxList
        name="roleIds"
        legend="Roles"
        options={roles}
        selected={initial?.roleIds ?? []}
        error={errors.roleIds?.[0]}
      />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="allBranches"
          checked={allBranches}
          onChange={(e) => setAllBranches(e.target.checked)}
          className="size-4 accent-[var(--color-primary)]"
        />
        Access to all branches
      </label>
      {!allBranches && (
        <CheckboxList
          name="branchIds"
          legend="Branches"
          options={branches}
          selected={initial?.branchIds ?? []}
          error={errors.branchIds?.[0]}
        />
      )}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function CheckboxList({
  name,
  legend,
  options,
  selected,
  error,
}: {
  name: string;
  legend: string;
  options: Option[];
  selected: string[];
  error?: string;
}) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error ? `${name}-error` : undefined}
    >
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={option.id}
              defaultChecked={selected.includes(option.id)}
              className="mt-0.5 size-4 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block font-medium">{option.name}</span>
              {option.description && (
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
