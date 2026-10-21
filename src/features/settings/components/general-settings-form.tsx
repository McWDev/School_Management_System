"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import type { GeneralSettings } from "../schemas";

type Props = {
  initial: GeneralSettings;
  /** Whether the user may change the settings (otherwise read-only). */
  canEdit: boolean;
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

/** Exam rules and number prefixes of the school. */
export function GeneralSettingsForm({ initial, canEdit, action }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const [parts, setParts] = useState({
    midtermMax: String(initial.midtermMax),
    activitiesMax: String(initial.activitiesMax),
    finalMax: String(initial.finalMax),
  });
  const total = Object.values(parts).reduce((sum, v) => sum + (/^\d+$/.test(v) ? Number(v) : 0), 0);
  const [prefixes, setPrefixes] = useState({
    studentPrefix: initial.studentPrefix,
    receiptPrefix: initial.receiptPrefix,
    payslipPrefix: initial.payslipPrefix,
  });

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-6" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-soft p-3 text-sm font-medium"
        >
          {state.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Exam rules</CardTitle>
          <CardDescription>
            Each subject is out of 100. Set how much Midterm, Activities and Final are worth, and
            the average a student needs to pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {(
            [
              ["midtermMax", "Midterm out of"],
              ["activitiesMax", "Activities out of"],
              ["finalMax", "Final out of"],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              id={`settings-${name}`}
              label={label}
              required
              error={errors[name]?.[0]}
            >
              {(p) => (
                <Input
                  {...p}
                  name={name}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={98}
                  value={parts[name]}
                  onChange={(e) => setParts((v) => ({ ...v, [name]: e.target.value }))}
                  readOnly={!canEdit}
                />
              )}
            </FormField>
          ))}
          <FormField
            id="settings-passMark"
            label="Pass mark (average)"
            required
            helperText="Out of 100."
            error={errors.passMark?.[0]}
          >
            {(p) => (
              <Input
                {...p}
                name="passMark"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                defaultValue={initial.passMark}
                readOnly={!canEdit}
              />
            )}
          </FormField>
          <p
            className={`text-sm sm:col-span-4 ${total === 100 ? "text-muted-foreground" : "font-medium text-danger"}`}
            aria-live="polite"
          >
            Midterm + Activities + Final = {total} {total === 100 ? "✓" : "(must be 100)"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Number prefixes</CardTitle>
          <CardDescription>
            Used for new numbers only; numbers already given never change.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["studentPrefix", "Student ID prefix", "0001"],
              ["receiptPrefix", "Receipt prefix", "000001"],
              ["payslipPrefix", "Payslip prefix", "000001"],
            ] as const
          ).map(([name, label, digits]) => (
            <FormField
              key={name}
              id={`settings-${name}`}
              label={label}
              required
              helperText={`Numbers look like ${(prefixes[name] || "…").toUpperCase()}-${digits}.`}
              error={errors[name]?.[0]}
            >
              {(p) => (
                <Input
                  {...p}
                  name={name}
                  maxLength={6}
                  autoCapitalize="characters"
                  value={prefixes[name]}
                  onChange={(e) => setPrefixes((v) => ({ ...v, [name]: e.target.value }))}
                  readOnly={!canEdit}
                  className="uppercase"
                />
              )}
            </FormField>
          ))}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </form>
  );
}
