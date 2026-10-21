import { z } from "zod";
import { optionalText, uuidSchema } from "@/lib/validation/fields";
import { PAYMENT_METHODS } from "@/features/fees/schemas";
import { todayIso } from "@/features/staff/schemas";

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const MONEY_MESSAGE = "Enter an amount like 300 or 300.50.";

/** An optional amount of 0 or more; "" counts as 0. */
const optionalMoney = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .pipe(z.string().regex(MONEY_PATTERN, MONEY_MESSAGE));

/** Pay (part of) one staff member's salary for a month. */
export const salaryPaymentInputSchema = z.object({
  staffId: uuidSchema,
  amount: z
    .string({ error: "Enter the amount paid." })
    .trim()
    .min(1, { error: "Enter the amount paid.", abort: true })
    .regex(MONEY_PATTERN, { error: MONEY_MESSAGE, abort: true })
    .refine((value) => /[1-9]/.test(value), "The amount must be more than 0."),
  paymentDate: z
    .string({ error: "Enter the payment date." })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date.")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Enter a valid date.")
    .refine((value) => value <= todayIso(), "The payment date cannot be in the future."),
  method: z.enum(PAYMENT_METHODS, { error: "Choose a payment method." }),
  reference: optionalText(100),
  bonus: optionalMoney,
  deduction: optionalMoney,
  note: optionalText(200),
});

export type SalaryPaymentInput = z.infer<typeof salaryPaymentInputSchema>;

/** "PAY-000001" from 1. */
export function formatPayslipNumber(n: number) {
  return `PAY-${String(n).padStart(6, "0")}`;
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

/** Filters of the All payments report (invalid values are ignored). */
export const salaryPaymentFilterSchema = z.object({
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  staffId: uuidSchema.optional().catch(undefined),
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .transform((value) => `${value}-01`)
    .optional()
    .catch(undefined),
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
  status: z.enum(["valid", "reversed"]).optional().catch(undefined),
});

export type SalaryPaymentFilters = z.infer<typeof salaryPaymentFilterSchema>;
