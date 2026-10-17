"use client";

import { useActionState, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { ageFrom } from "../schemas";

export type StaffValues = {
  fullName: string;
  workTypeId: string;
  gender: "male" | "female" | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  location: string | null;
  hireDate: string | null;
  status: "active" | "left";
};

type Props = {
  mode: "create" | "edit";
  workTypes: { id: string; name: string }[];
  initial?: StaffValues;
  /** Current photo URL (edit mode). */
  photoSrc?: string | null;
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

export function StaffFormDialog(props: Props) {
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
          {mode === "create" ? "Add staff" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Add staff member" : `Edit ${initial?.fullName}`}
        description="Full name and work type are required; everything else is optional."
        className="max-w-2xl"
      >
        <StaffForm key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StaffForm({
  mode,
  workTypes,
  initial,
  photoSrc,
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
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const age = ageFrom(dateOfBirth);
  const id = mode === "create" ? "new-staff" : "edit-staff";

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const shownPhoto = preview ?? (removePhoto ? null : (photoSrc ?? null));

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}

      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {shownPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview or private photo route
            <img src={shownPhoto} alt="Staff photo" className="size-full object-cover" />
          ) : (
            <UserRound className="size-9 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-photo`} className="text-sm font-medium">
            Photo
          </label>
          <input
            id={`${id}-photo`}
            name="photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby={`${id}-photo-help`}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-muted"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
              if (file) setRemovePhoto(false);
            }}
          />
          <p id={`${id}-photo-help`} className="text-xs text-muted-foreground">
            PNG, JPEG or WebP, up to 1 MB.
          </p>
          {errors.photo?.[0] && (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.photo[0]}
            </p>
          )}
          {mode === "edit" && photoSrc && !preview && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="removePhoto"
                checked={removePhoto}
                onChange={(e) => setRemovePhoto(e.target.checked)}
                className="size-3.5 accent-[var(--color-primary)]"
              />
              Remove photo
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${id}-name`} label="Full name" required error={errors.fullName?.[0]}>
          {(p) => <Input {...p} name="fullName" defaultValue={initial?.fullName} maxLength={200} />}
        </FormField>
        <FormField id={`${id}-work-type`} label="Work type" required error={errors.workTypeId?.[0]}>
          {(p) => (
            <Select {...p} name="workTypeId" defaultValue={initial?.workTypeId ?? ""}>
              <option value="" disabled>
                Choose a work type
              </option>
              {workTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id={`${id}-phone`} label="Phone" error={errors.phone?.[0]}>
          {(p) => <Input {...p} name="phone" type="tel" defaultValue={initial?.phone ?? ""} />}
        </FormField>
        <FormField id={`${id}-email`} label="Email" error={errors.email?.[0]}>
          {(p) => <Input {...p} name="email" type="email" defaultValue={initial?.email ?? ""} />}
        </FormField>
        <FormField id={`${id}-gender`} label="Gender" error={errors.gender?.[0]}>
          {(p) => (
            <Select {...p} name="gender" defaultValue={initial?.gender ?? ""}>
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          )}
        </FormField>
        <FormField
          id={`${id}-dob`}
          label="Date of birth"
          helperText={age !== null ? `Age: ${age}` : "Age is calculated from the date of birth."}
          error={errors.dateOfBirth?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-location`}
          label="Location"
          helperText="Area, district or city."
          error={errors.location?.[0]}
        >
          {(p) => <Input {...p} name="location" defaultValue={initial?.location ?? ""} />}
        </FormField>
        <FormField id={`${id}-hire`} label="Hire date" error={errors.hireDate?.[0]}>
          {(p) => (
            <Input {...p} name="hireDate" type="date" defaultValue={initial?.hireDate ?? ""} />
          )}
        </FormField>
      </div>
      <FormField id={`${id}-address`} label="Address" error={errors.address?.[0]}>
        {(p) => <Textarea {...p} name="address" defaultValue={initial?.address ?? ""} />}
      </FormField>
      {mode === "edit" && (
        <FormField
          id={`${id}-status`}
          label="Status"
          helperText="Staff who leave are kept on record as “Left”."
          error={errors.status?.[0]}
        >
          {(p) => (
            <Select
              {...p}
              name="status"
              defaultValue={initial?.status ?? "active"}
              className="sm:max-w-xs"
            >
              <option value="active">Active</option>
              <option value="left">Left</option>
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
          {pending ? "Saving…" : mode === "create" ? "Add staff member" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
