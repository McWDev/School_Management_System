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
import { fromHundredths, MARK_PARTS, SUBJECT_MAX, subjectTotal, type MarkPart } from "../schemas";

type Subject = {
  id: string;
  name: string;
  teacherName: string | null;
  canEnter: boolean;
} & Record<MarkPart, string | null>;

type Props = {
  subjects: Subject[];
  action: (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;
};

const VALID = /^\d{1,2}(\.\d{1,2})?$/;

/**
 * One student's marks in every subject. Subjects the user may not enter are
 * shown but not sent, so saving never touches them.
 */
export function StudentMarksForm({ subjects, action }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const [values, setValues] = useState<Record<string, Record<MarkPart, string>>>(() =>
    Object.fromEntries(
      subjects.map((s) => [
        s.id,
        { midterm: s.midterm ?? "", activities: s.activities ?? "", final: s.final ?? "" },
      ]),
    ),
  );
  const editable = subjects.some((s) => s.canEnter);

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
            <TableHead>Subject</TableHead>
            {MARK_PARTS.map((p) => (
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
          {subjects.map((subject) => {
            const current = values[subject.id];
            const filled = MARK_PARTS.some((p) => current[p.key] !== "");
            const total = subjectTotal(
              Object.fromEntries(
                MARK_PARTS.map((p) => [p.key, VALID.test(current[p.key]) ? current[p.key] : null]),
              ),
            );
            return (
              <TableRow key={subject.id}>
                <TableCell>
                  {subject.canEnter && <input type="hidden" name="subjectIds" value={subject.id} />}
                  <span className="block font-medium">{subject.name}</span>
                  {subject.teacherName && (
                    <span className="block text-xs text-muted-foreground">
                      {subject.teacherName}
                    </span>
                  )}
                </TableCell>
                {MARK_PARTS.map((p) => {
                  const name = `${p.key}:${subject.id}`;
                  const error = errors[name]?.[0];
                  return (
                    <TableCell key={p.key}>
                      <Input
                        name={subject.canEnter ? name : undefined}
                        aria-label={`${p.label} in ${subject.name}`}
                        inputMode="decimal"
                        value={current[p.key]}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [subject.id]: { ...v[subject.id], [p.key]: e.target.value },
                          }))
                        }
                        readOnly={!subject.canEnter}
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
      {editable && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">
            Leave all three boxes empty for a subject without marks.
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save marks"}
          </Button>
        </div>
      )}
    </form>
  );
}
