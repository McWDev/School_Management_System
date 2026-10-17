"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";

type Props = {
  /** Text of the button that opens the dialog. */
  label: string;
  title: string;
  /** Explains the impact of the action (07: confirmations explain impact). */
  description: string;
  confirmLabel: string;
  variant?: "primary" | "outline" | "destructive" | "ghost";
  size?: "sm" | "md";
  /** "required" / "optional" adds a reason field (sent as `reason`). */
  reason?: "required" | "optional";
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

/** Button + confirmation dialog for significant actions (archive, disable, approve…). */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  variant = "outline",
  size = "sm",
  reason,
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") setOpen(false);
      return result;
    },
    IDLE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant === "primary" ? "outline" : variant} size={size}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form action={formAction} className="flex flex-col gap-4">
          {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
          {reason && (
            <FormField
              id="confirm-reason"
              label={reason === "required" ? "Reason" : "Reason (optional)"}
              required={reason === "required"}
              error={state.status === "error" ? state.fieldErrors?.reason?.[0] : undefined}
            >
              {(props) => <Textarea {...props} name="reason" maxLength={1000} />}
            </FormField>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={variant === "destructive" ? "destructive" : "primary"}
              disabled={pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
