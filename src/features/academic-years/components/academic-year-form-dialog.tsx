"use client";

import { useActionState, useState } from "react";
import { keepValues } from "@/components/forms/keep-values";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { ACADEMIC_YEAR_STATUSES, academicYearStatusLabels } from "../schemas";

type Props = {
  mode: "create" | "edit";
  initial?: { name: string; status: (typeof ACADEMIC_YEAR_STATUSES)[number] };
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

export function AcademicYearFormDialog(props: Props) {
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
          {mode === "create" ? "Add academic year" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Add academic year" : `Edit ${initial?.name}`}
        description="Academic year names are unique in your school."
      >
        <AcademicYearForm key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AcademicYearForm({ mode, initial, action, onSaved }: Props & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") onSaved();
      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const id = mode === "create" ? "new-year" : "edit-year";

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <FormField
        id={`${id}-name`}
        label="Academic year"
        required
        helperText="e.g. 2026–2027"
        error={errors.name?.[0]}
      >
        {(p) => <Input {...p} name="name" defaultValue={initial?.name} maxLength={40} />}
      </FormField>
      <FormField
        id={`${id}-status`}
        label="Status"
        helperText="Only one year can be Current. Making this year Current closes the previous one."
        error={errors.status?.[0]}
      >
        {(p) => (
          <Select {...p} name="status" defaultValue={initial?.status ?? "upcoming"}>
            {ACADEMIC_YEAR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {academicYearStatusLabels[s]}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Add academic year" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
