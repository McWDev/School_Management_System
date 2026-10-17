"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { OneTimeLink } from "@/components/forms/one-time-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { IDLE, type FormResult } from "@/lib/form-result";

export function ResetLinkDialog({
  userName,
  action,
}: {
  userName: string;
  action: () => Promise<FormResult<{ url: string; expiresAt: string }>>;
}) {
  const [state, formAction, pending] = useActionState(async () => action(), IDLE);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reset link
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Password reset for ${userName}`}
        description="Creates a one-time link that lets this user choose a new password. Using it signs them out everywhere."
      >
        {state.status === "success" ? (
          <OneTimeLink
            url={state.data.url}
            expiresAt={state.data.expiresAt}
            intro="Reset link created."
          />
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create reset link"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
