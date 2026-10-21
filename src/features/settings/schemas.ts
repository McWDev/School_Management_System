import { z } from "zod";

/** Defaults for a school that has not changed its General Settings. */
export const DEFAULT_SETTINGS = {
  passMark: 50,
  midtermMax: 30,
  activitiesMax: 20,
  finalMax: 50,
  studentPrefix: "STU",
  receiptPrefix: "RCT",
  payslipPrefix: "PAY",
} as const;

export type GeneralSettings = {
  passMark: number;
  midtermMax: number;
  activitiesMax: number;
  finalMax: number;
  studentPrefix: string;
  receiptPrefix: string;
  payslipPrefix: string;
};

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string({ error: `Enter the ${label}.` })
    .trim()
    .min(1, { error: `Enter the ${label}.`, abort: true })
    .regex(/^\d+$/, { error: "Use a whole number.", abort: true })
    .transform(Number)
    .pipe(z.number().int().min(min, `Use at least ${min}.`).max(max, `Use at most ${max}.`));

const prefix = (label: string) =>
  z
    .string({ error: `Enter the ${label}.` })
    .trim()
    .toUpperCase()
    .min(1, { error: `Enter the ${label}.`, abort: true })
    .regex(/^[A-Z0-9]{1,6}$/, "Use 1–6 letters or digits, e.g. STU.");

/** General Settings form: exam rules and number prefixes. */
export const generalSettingsSchema = z
  .object({
    passMark: wholeNumber("pass mark", 1, 100),
    midtermMax: wholeNumber("Midterm maximum", 1, 98),
    activitiesMax: wholeNumber("Activities maximum", 1, 98),
    finalMax: wholeNumber("Final maximum", 1, 98),
    studentPrefix: prefix("Student ID prefix"),
    receiptPrefix: prefix("receipt prefix"),
    payslipPrefix: prefix("payslip prefix"),
  })
  .superRefine((value, ctx) => {
    const total = value.midtermMax + value.activitiesMax + value.finalMax;
    if (total !== 100) {
      ctx.addIssue({
        code: "custom",
        path: ["finalMax"],
        message: `Midterm, Activities and Final must add up to 100 (now ${total}).`,
      });
    }
  });
