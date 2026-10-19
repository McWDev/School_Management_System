"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";

type Props = {
  subjectName: string;
  /** Current teacher (staff id), if any. */
  currentStaffId: string | null;
  currentTeacherName: string | null;
  /** Active staff with the work type Teacher. */
  teachers: { id: string; fullName: string; phone: string | null }[];
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

/** Choose the one teacher of a subject, or clear it. */
export function AssignTeacherDialog(props: Props) {
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
          Assign teacher
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Assign teacher to ${props.subjectName}`}
        description="Only Active staff whose work type is Teacher are listed. Choosing another teacher replaces the current one."
      >
        <AssignForm key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({
  currentStaffId,
  currentTeacherName,
  teachers,
  action,
  onSaved,
}: Props & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") onSaved();
      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  // The current teacher may no longer qualify (e.g. now Inactive); keep them visible.
  const listed = teachers.some((t) => t.id === currentStaffId);

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && !errors.staffId && <FormAlert>{state.message}</FormAlert>}
      <FormField id="assign-teacher" label="Teacher" error={errors.staffId?.[0]}>
        {(p) => (
          <Select {...p} name="staffId" defaultValue={currentStaffId ?? ""}>
            <option value="">No teacher</option>
            {currentStaffId && !listed && (
              <option value={currentStaffId}>
                {currentTeacherName} (no longer an Active teacher)
              </option>
            )}
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
                {t.phone ? ` · ${t.phone}` : ""}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {teachers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Active staff with the work type Teacher yet. Add them on{" "}
          <Link href="/staff" className="font-medium text-primary underline">
            School Staff
          </Link>
          .
        </p>
      )}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
