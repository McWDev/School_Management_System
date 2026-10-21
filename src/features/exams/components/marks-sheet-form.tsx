"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IDLE, type FormResult } from "@/lib/form-result";
import {
  fromHundredths,
  SUBJECT_MAX,
  subjectTotal,
  type ExamRules,
  type MarkPart,
} from "../schemas";

type Row = {
  studentId: string;
  studentNumber: string;
  fullName: string;
} & Record<MarkPart, string | null>;

type Props = {
  /** The school's parts and their maximums (General Settings). */
  parts: ExamRules["parts"];
  rows: Row[];
  /** Marks cannot be changed by this user. */
  readOnly: boolean;
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

const VALID = /^\d{1,2}(\.\d{1,2})?$/;

/**
 * Every student of the class with Midterm (30), Activities (20) and Final
 * (50) boxes; the total out of 100 updates as marks are typed.
 */
export function MarksSheetForm({ parts, rows, readOnly, action }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const [values, setValues] = useState<Record<string, Record<MarkPart, string>>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.studentId,
        { midterm: r.midterm ?? "", activities: r.activities ?? "", final: r.final ?? "" },
      ]),
    ),
  );

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-soft p-3 text-sm font-medium"
        >
          {state.message}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Student</TableHead>
            {parts.map((p) => (
              <TableHead key={p.key} className="w-28">
                {p.label} <span className="font-normal text-muted-foreground">/{p.max}</span>
              </TableHead>
            ))}
            <TableHead className="w-24 text-right">
              Total <span className="font-normal text-muted-foreground">/{SUBJECT_MAX}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const current = values[row.studentId];
            const filled = parts.some((p) => current[p.key] !== "");
            const total = subjectTotal(
              Object.fromEntries(
                parts.map((p) => [p.key, VALID.test(current[p.key]) ? current[p.key] : null]),
              ),
            );
            return (
              <TableRow key={row.studentId}>
                <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <input type="hidden" name="studentIds" value={row.studentId} />
                  <span className="block font-medium">{row.fullName}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {row.studentNumber}
                  </span>
                </TableCell>
                {parts.map((p) => {
                  const name = `${p.key}:${row.studentId}`;
                  const error = errors[name]?.[0] ?? errors[`entries.${index}.${p.key}`]?.[0];
                  return (
                    <TableCell key={p.key}>
                      <Input
                        name={name}
                        aria-label={`${p.label} for ${row.fullName}`}
                        inputMode="decimal"
                        value={current[p.key]}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [row.studentId]: { ...v[row.studentId], [p.key]: e.target.value },
                          }))
                        }
                        readOnly={readOnly}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `${name}-error` : undefined}
                        className="w-20"
                      />
                      {error && (
                        <p
                          id={`${name}-error`}
                          role="alert"
                          className="mt-1 text-xs font-medium text-danger"
                        >
                          {error}
                        </p>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold tabular-nums">
                  {filled ? fromHundredths(total) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">
            Leave all three boxes empty for a student without marks.
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save marks"}
          </Button>
        </div>
      )}
    </form>
  );
}
