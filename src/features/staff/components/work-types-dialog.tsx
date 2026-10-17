"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";

type Action = (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;

export type WorkTypeRow = {
  id: string;
  name: string;
  staffCount: number;
  rename: Action;
  remove: () => Promise<FormResult<unknown>>;
};

/** Manage the school's work types: add, rename, and remove unused ones. */
export function WorkTypesDialog({
  workTypes,
  create,
}: {
  workTypes: WorkTypeRow[];
  create: Action;
}) {
  const [state, formAction, pending] = useActionState(create, IDLE);
  const [addKey, setAddKey] = useState(0);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog onOpenChange={() => setAddKey((k) => k + 1)}>
      <DialogTrigger asChild>
        <Button variant="outline">Work types</Button>
      </DialogTrigger>
      <DialogContent
        title="Work types"
        description="The jobs staff can have at your school. A work type in use cannot be removed."
      >
        <form
          key={addKey}
          action={formAction}
          className="flex flex-col gap-2"
          noValidate
          onSubmit={(e) => {
            if (!(e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim()) {
              e.preventDefault();
            }
          }}
        >
          <label htmlFor="new-work-type" className="text-sm font-medium">
            Add a work type
          </label>
          <div className="flex gap-2">
            <Input
              id="new-work-type"
              name="name"
              placeholder="e.g. Nurse"
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "new-work-type-error" : undefined}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </div>
          {errors.name?.[0] && (
            <p id="new-work-type-error" role="alert" className="text-xs font-medium text-danger">
              {errors.name[0]}
            </p>
          )}
        </form>
        <ul className="flex flex-col divide-y rounded-md border" aria-label="Work types">
          {workTypes.map((type) => (
            <WorkTypeItem key={type.id} type={type} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function WorkTypeItem({ type }: { type: WorkTypeRow }) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renaming] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await type.rename(prev, formData);
      if (result.status === "success") setEditing(false);
      return result;
    },
    IDLE,
  );
  const [removeState, removeAction, removing] = useActionState(async () => type.remove(), IDLE);
  const error =
    (renameState.status === "error" && renameState.message) ||
    (removeState.status === "error" && removeState.message) ||
    null;

  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      {editing ? (
        <form action={renameAction} className="flex items-center gap-2">
          <Input
            name="name"
            defaultValue={type.name}
            maxLength={80}
            aria-label={`New name for ${type.name}`}
            autoFocus
            className="h-8"
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            aria-label="Save name"
            disabled={renaming}
          >
            <Check aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cancel rename"
            onClick={() => setEditing(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">
            {type.name}
            <span className="ml-2 text-xs text-muted-foreground">
              {type.staffCount} {type.staffCount === 1 ? "staff member" : "staff"}
            </span>
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Rename ${type.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <form action={removeAction}>
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${type.name}`}
              disabled={removing || type.staffCount > 0}
              title={
                type.staffCount > 0
                  ? "In use: change those staff members' work type first"
                  : undefined
              }
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
