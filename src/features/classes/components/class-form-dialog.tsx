"use client";

import { useActionState, useState } from "react";
import { keepValues } from "@/components/forms/keep-values";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { MAX_CLASS_SEATS } from "../schemas";

type Props = {
  mode: "create" | "edit";
  initial?: { name: string; seats: number; status: "active" | "inactive" };
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

export function ClassFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { mode, initial } = props;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={mode === "create" ? "primary" : "outline"}
          size={mode === "create" ? "md" : "sm"}
        >
          {mode === "create" ? "Add class" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Add class" : `Edit ${initial?.name}`}
        description="Class names are unique in your school."
      >
        <ClassForm key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ClassForm({ mode, initial, action, onSaved }: Props & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") onSaved();
      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const id = mode === "create" ? "new-class" : "edit-class";

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <FormField
        id={`${id}-name`}
        label="Class name"
        required
        helperText="e.g. Grade 1A"
        error={errors.name?.[0]}
      >
        {(p) => <Input {...p} name="name" defaultValue={initial?.name} maxLength={80} />}
      </FormField>
      <FormField
        id={`${id}-seats`}
        label="Class seats"
        required
        helperText={`How many students can learn in this class (1–${MAX_CLASS_SEATS}).`}
        error={errors.seats?.[0]}
      >
        {(p) => (
          <Input
            {...p}
            name="seats"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CLASS_SEATS}
            step={1}
            defaultValue={initial?.seats}
            className="sm:max-w-40"
          />
        )}
      </FormField>
      {mode === "edit" && (
        <FormField
          id={`${id}-status`}
          label="Status"
          helperText="Inactive classes are kept but not used for new records."
          error={errors.status?.[0]}
        >
          {(p) => (
            <Select {...p} name="status" defaultValue={initial?.status ?? "active"}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          )}
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Add class" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
