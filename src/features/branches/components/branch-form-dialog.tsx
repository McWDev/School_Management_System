"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";

type BranchValues = {
  branchCode: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function BranchFormDialog({
  mode,
  initial,
  action,
}: {
  mode: "create" | "edit";
  initial?: BranchValues;
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") setOpen(false);
      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const prefix = mode === "create" ? "new-branch" : `branch-${initial?.branchCode}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={mode === "create" ? "primary" : "outline"}
          size={mode === "create" ? "md" : "sm"}
        >
          {mode === "create" ? "Add branch" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Add branch" : `Edit ${initial?.name}`}
        description="Branch codes are unique within your school and stored in capital letters."
      >
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <FormField id={`${prefix}-code`} label="Code" required error={errors.branchCode?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="branchCode"
                  defaultValue={initial?.branchCode}
                  maxLength={20}
                />
              )}
            </FormField>
            <FormField id={`${prefix}-name`} label="Name" required error={errors.name?.[0]}>
              {(props) => (
                <Input {...props} name="name" defaultValue={initial?.name} maxLength={200} />
              )}
            </FormField>
          </div>
          <FormField id={`${prefix}-address`} label="Address" error={errors.address?.[0]}>
            {(props) => (
              <Textarea {...props} name="address" defaultValue={initial?.address ?? ""} />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={`${prefix}-phone`} label="Phone" error={errors.phone?.[0]}>
              {(props) => (
                <Input {...props} name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
              )}
            </FormField>
            <FormField id={`${prefix}-email`} label="Email" error={errors.email?.[0]}>
              {(props) => (
                <Input {...props} name="email" type="email" defaultValue={initial?.email ?? ""} />
              )}
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create branch" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
