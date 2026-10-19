"use client";

import { useActionState, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { ageFrom } from "@/features/staff/schemas";
import {
  FEE_TYPES,
  feeTypeLabels,
  STUDENT_STATUSES,
  studentStatusLabels,
  type FeeType,
  type StudentStatus,
} from "../schemas";

/** "25.00" → "25", "25.50" stays, for editing amounts. */
function stripZeros(amount: string) {
  return amount.replace(/.00$/, "");
}

/** Today in the user’s own time zone (YYYY-MM-DD). */
function localToday() {
  return new Date().toLocaleDateString("en-CA");
}

export type StudentValues = {
  studentNumber: string;
  fullName: string;
  gender: "male" | "female";
  dateOfBirth: string;
  classId: string | null;
  academicYearId: string | null;
  admissionDate: string;
  guardianName: string;
  guardianPhone: string;
  phone: string | null;
  address: string | null;
  status: StudentStatus;
  fees: {
    feeType: FeeType;
    feeAmount: string | null;
    registrationFee: string;
    registrationFeePaid: boolean;
  } | null;
};

export type StudentFormOptions = {
  classes: { id: string; name: string; seats: number; status: "active" | "inactive" }[];
  academicYears: { id: string; name: string; status: "upcoming" | "current" | "closed" }[];
  currencyCode: string;
  seatsTaken: Record<string, number>;
};

type Props = {
  mode: "create" | "edit";
  options: StudentFormOptions;
  initial?: StudentValues;
  /** Current photo URL (edit mode). */
  photoSrc?: string | null;
  /** Whether the user may change the status (students.archive). */
  canChangeStatus?: boolean;
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

export function StudentFormDialog(props: Props) {
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
          {mode === "create" ? "Register student" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={
          mode === "create"
            ? "Register student"
            : `Edit ${initial?.fullName} (${initial?.studentNumber})`
        }
        description={
          mode === "create"
            ? "Fields marked * are required. The Student ID is given automatically."
            : "Fields marked * are required."
        }
        className="max-w-2xl"
      >
        <StudentForm key={formKey} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StudentForm({
  mode,
  options,
  initial,
  photoSrc,
  canChangeStatus,
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
  const duplicate = errors.duplicate?.[0];
  const id = mode === "create" ? "new-student" : "edit-student";

  const currentYear = options.academicYears.find((y) => y.status === "current");
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? "");
  const [academicYearId, setAcademicYearId] = useState(
    initial?.academicYearId ?? currentYear?.id ?? "",
  );
  const [feeType, setFeeType] = useState<string>(initial?.fees?.feeType ?? "");
  const [registrationFee, setRegistrationFee] = useState(
    initial?.fees ? stripZeros(initial.fees.registrationFee) : "",
  );
  const feeIsZero = !/[1-9]/.test(registrationFee);
  const alreadyPaid = initial?.fees?.registrationFeePaid ?? false;
  const currency = options.currencyCode;
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const age = ageFrom(dateOfBirth);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const shownPhoto = preview ?? (removePhoto ? null : (photoSrc ?? null));

  // New placements need an Active class and a year that is not Closed; the
  // student's own class and year stay selectable when editing.
  const years = options.academicYears.filter(
    (y) => y.status !== "closed" || y.id === initial?.academicYearId,
  );
  const classOptions = options.classes.filter(
    (c) => c.status === "active" || c.id === initial?.classId,
  );
  function seatsLeft(classId: string, seats: number) {
    if (!academicYearId) return null;
    let taken = options.seatsTaken[`${classId}:${academicYearId}`] ?? 0;
    // The student's own seat is free for them.
    if (
      initial?.status === "active" &&
      initial.classId === classId &&
      initial.academicYearId === academicYearId
    ) {
      taken -= 1;
    }
    return Math.max(0, seats - taken);
  }

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && !duplicate && <FormAlert>{state.message}</FormAlert>}
      {duplicate && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-warning bg-warning-soft p-3 text-sm"
        >
          <p className="font-medium">Possible duplicate</p>
          <p>{duplicate}</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="confirmDuplicate"
              className="size-4 accent-[var(--color-primary)]"
            />
            This is a different student. Register anyway.
          </label>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {shownPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview or private photo route
            <img src={shownPhoto} alt="Student photo" className="size-full object-cover" />
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
            Optional. PNG, JPEG or WebP, up to 1 MB.
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

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Student details</legend>
        <FormField
          id={`${id}-name`}
          label="Full name"
          required
          error={errors.fullName?.[0]}
          className="sm:col-span-2"
        >
          {(p) => <Input {...p} name="fullName" defaultValue={initial?.fullName} maxLength={200} />}
        </FormField>
        <FormField id={`${id}-gender`} label="Gender" required error={errors.gender?.[0]}>
          {(p) => (
            <Select {...p} name="gender" defaultValue={initial?.gender ?? ""}>
              <option value="" disabled>
                Choose a gender
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          )}
        </FormField>
        <FormField
          id={`${id}-dob`}
          label="Date of birth"
          required
          helperText={age !== null ? `Age: ${age}` : undefined}
          error={errors.dateOfBirth?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="dateOfBirth"
              type="date"
              max={localToday()}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          )}
        </FormField>
        <FormField id={`${id}-phone`} label="Student phone" error={errors.phone?.[0]}>
          {(p) => <Input {...p} name="phone" type="tel" defaultValue={initial?.phone ?? ""} />}
        </FormField>
        <FormField id={`${id}-address`} label="Address" error={errors.address?.[0]}>
          {(p) => <Textarea {...p} name="address" rows={1} defaultValue={initial?.address ?? ""} />}
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Class placement</legend>
        <FormField
          id={`${id}-year`}
          label="Academic year"
          required
          error={errors.academicYearId?.[0]}
          helperText={years.length === 0 ? "Add an academic year first." : undefined}
        >
          {(p) => (
            <Select
              {...p}
              name="academicYearId"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
            >
              <option value="" disabled>
                Choose an academic year
              </option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.status === "current" ? " (Current)" : y.status === "closed" ? " (Closed)" : ""}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          id={`${id}-class`}
          label="Class"
          required
          error={errors.classId?.[0]}
          helperText={
            classOptions.length === 0
              ? "Add a class first."
              : "Seats left are for the chosen academic year."
          }
        >
          {(p) => (
            <Select {...p} name="classId" defaultValue={initial?.classId ?? ""}>
              <option value="" disabled>
                Choose a class
              </option>
              {classOptions.map((c) => {
                const left = seatsLeft(c.id, c.seats);
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {left === null
                      ? ""
                      : left === 0
                        ? " (full)"
                        : ` (${left} of ${c.seats} seats left)`}
                  </option>
                );
              })}
            </Select>
          )}
        </FormField>
        <FormField
          id={`${id}-admission`}
          label="Admission date"
          required
          error={errors.admissionDate?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="admissionDate"
              type="date"
              max={localToday()}
              defaultValue={initial?.admissionDate ?? localToday()}
            />
          )}
        </FormField>
        {mode === "edit" && (
          <FormField
            id={`${id}-status`}
            label="Status"
            helperText={
              canChangeStatus
                ? "Only Active students take a class seat."
                : "You cannot change the status."
            }
            error={errors.status?.[0]}
          >
            {(p) => (
              <Select
                {...p}
                name="status"
                defaultValue={initial?.status ?? "active"}
                disabled={!canChangeStatus}
              >
                {STUDENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {studentStatusLabels[s]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        {mode === "edit" && !canChangeStatus && (
          <input type="hidden" name="status" value={initial?.status ?? "active"} />
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Guardian details</legend>
        <FormField
          id={`${id}-guardian`}
          label="Guardian name"
          required
          error={errors.guardianName?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="guardianName"
              defaultValue={initial?.guardianName ?? ""}
              maxLength={200}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-guardian-phone`}
          label="Guardian phone"
          required
          error={errors.guardianPhone?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="guardianPhone"
              type="tel"
              defaultValue={initial?.guardianPhone ?? ""}
            />
          )}
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Fees</legend>
        <FormField id={`${id}-fee-type`} label="Fee type" required error={errors.feeType?.[0]}>
          {(p) => (
            <Select
              {...p}
              name="feeType"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value)}
            >
              <option value="" disabled>
                Choose a fee type
              </option>
              {FEE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {feeTypeLabels[t]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {feeType === "full_payment" || feeType === "partial_fee" ? (
          <FormField
            id={`${id}-partial-fee`}
            label={`Amount they pay (${currency})`}
            required
            helperText={
              feeType === "partial_fee"
                ? "The reduced fee this student pays."
                : "The full fee this student pays."
            }
            error={errors.feeAmount?.[0]}
          >
            {(p) => (
              <Input
                {...p}
                name="feeAmount"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={initial?.fees?.feeAmount ? stripZeros(initial.fees.feeAmount) : ""}
              />
            )}
          </FormField>
        ) : (
          <div className="hidden sm:block" aria-hidden="true" />
        )}
        <FormField
          id={`${id}-registration-fee`}
          label={`Registration fee (${currency})`}
          required
          helperText="Enter 0 if there is no registration fee."
          error={errors.registrationFee?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="registrationFee"
              inputMode="decimal"
              placeholder="0.00"
              value={registrationFee}
              onChange={(e) => setRegistrationFee(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-1 self-center sm:mt-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="registrationFeePaid"
              disabled={feeIsZero || alreadyPaid}
              defaultChecked={alreadyPaid}
              className="size-4 accent-[var(--color-primary)]"
            />
            Registration fee is paid
          </label>
          <p className="text-xs text-muted-foreground">
            {alreadyPaid
              ? "Paid. To undo it, reverse the payment in Student Fees."
              : "Ticking records a cash payment with a receipt."}
          </p>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Register student" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
