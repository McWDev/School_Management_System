"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { PERMISSIONS, TENANT_PERMISSIONS } from "@/lib/permissions/catalog";

const GROUPS = [...new Set(TENANT_PERMISSIONS.map((p) => PERMISSIONS[p].group))];

export function RoleFormDialog({
  mode,
  initial,
  action,
}: {
  mode: "create" | "edit";
  initial?: { name: string; description: string | null; permissions: string[] };
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
  const id = mode === "create" ? "new-role" : `role-${initial?.name.replace(/\W+/g, "-")}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={mode === "create" ? "primary" : "outline"}
          size={mode === "create" ? "md" : "sm"}
        >
          {mode === "create" ? "New role" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "New role" : `Edit ${initial?.name}`}
        description="Changes apply to everyone with this role on their next page load."
        className="max-w-3xl"
      >
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={`${id}-name`} label="Name" required error={errors.name?.[0]}>
              {(props) => (
                <Input {...props} name="name" defaultValue={initial?.name} maxLength={80} />
              )}
            </FormField>
            <FormField id={`${id}-description`} label="Description" error={errors.description?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  defaultValue={initial?.description ?? ""}
                  className="min-h-9"
                />
              )}
            </FormField>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">Permissions</legend>
            {errors.permissions?.[0] && (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.permissions[0]}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {GROUPS.map((group) => (
                <div key={group} className="rounded-md border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {TENANT_PERMISSIONS.filter((p) => PERMISSIONS[p].group === group).map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p}
                          defaultChecked={initial?.permissions.includes(p)}
                          className="size-4 accent-[var(--color-primary)]"
                        />
                        {PERMISSIONS[p].description}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create role" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
