import { z } from "zod";
import { optionalText, uuidSchema } from "@/lib/validation/fields";
import { todayIso } from "@/features/staff/schemas";

export const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/** "2026-10" (or "2026-10-01") → "2026-10-01". */
export const monthSchema = z
  .string({ error: "Choose a month." })
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/, "Choose a month.")
  .transform((value) => `${value.slice(0, 7)}-01`)
  .refine((value) => value >= "2000-01-01", "Choose a month.");

/** The month of a date string, as "YYYY-MM-01". */
export function monthOf(date: string) {
  return `${date.slice(0, 7)}-01`;
}

/** "2026-10-01" → "October 2026". */
export function monthLabel(month: string) {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The last day of a "YYYY-MM-01" month. */
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const paymentInputSchema = z.object({
  studentId: uuidSchema,
  paymentDate: z
    .string({ error: "Enter the payment date." })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date.")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Enter a valid date.")
    .refine((value) => value <= todayIso(), "The payment date cannot be in the future."),
  method: z.enum(PAYMENT_METHODS, { error: "Choose a payment method." }),
  reference: optionalText(100),
  notes: optionalText(500),
  lines: z
    .array(
      z.object({
        chargeId: uuidSchema,
        amount: z
          .string()
          .trim()
          .regex(MONEY_PATTERN, "Enter an amount like 25 or 25.50.")
          .refine((value) => /[1-9]/.test(value), "The amount must be more than 0."),
      }),
    )
    .min(1, "Choose at least one fee to pay."),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const reasonSchema = z.object({
  reason: z
    .string({ error: "Enter a reason." })
    .trim()
    .min(3, "Enter a reason.")
    .max(500, "Use at most 500 characters."),
});

export const feeBalanceFilterSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
  classId: uuidSchema.optional().catch(undefined),
  balance: z.enum(["owing", "paid"]).optional().catch(undefined),
});

export const paymentListFilterSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
  month: monthSchema.optional().catch(undefined),
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
});

/** "RCT-000001" from 1. */
export function formatReceiptNumber(n: number, prefix = "RCT") {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}
