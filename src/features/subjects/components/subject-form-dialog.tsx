"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";

type Props = {
  mode: "create" | "edit";
  initial?: { name: string; code: string; status: "active" | "inactive" };
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

export function SubjectFormDialog(props: Props) {
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
          {mode === "create" ? "Add subject" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Add subject" : `Edit ${initial?.name} (${initial?.code})`}
        description={
          mode === "create"
            ? "Subject names are unique in your school. The code is given automatically."
            : "Subject names are unique in your school. The code never changes."
        }
      >
        <SubjectForm key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SubjectForm({ mode, initial, action, onSaved }: Props & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") onSaved();
      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const id = mode === "create" ? "new-subject" : "edit-subject";

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <FormField
        id={`${id}-name`}
        label="Subject name"
        required
        helperText="e.g. Mathematics"
        error={errors.name?.[0]}
      >
        {(p) => <Input {...p} name="name" defaultValue={initial?.name} maxLength={80} />}
      </FormField>
      {mode === "edit" && (
        <FormField
          id={`${id}-status`}
          label="Status"
          helperText="Inactive subjects are kept but not used for new exams."
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
          {pending ? "Saving…" : mode === "create" ? "Add subject" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
