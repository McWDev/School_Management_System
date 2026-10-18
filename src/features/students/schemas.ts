import { z } from "zod";
import { optionalText, uuidSchema } from "@/lib/validation/fields";
import { todayIso } from "@/features/staff/schemas";

export const STUDENT_STATUSES = ["active", "graduated", "transferred", "left"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const studentStatusLabels: Record<StudentStatus, string> = {
  active: "Active",
  graduated: "Graduated",
  transferred: "Transferred",
  left: "Left",
};

/** Required ISO date (YYYY-MM-DD). `message` is shown when it is missing. */
const requiredDate = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { error: message, abort: true })
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
      error: "Enter a valid date.",
      abort: true,
    })
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
      error: "Enter a valid date.",
      abort: true,
    });

const requiredText = (message: string, max: number) =>
  z.string({ error: message }).trim().min(1, message).max(max, `Use at most ${max} characters.`);

const requiredId = (message: string) =>
  z.string({ error: message }).trim().min(1, { error: message, abort: true }).pipe(z.uuid(message));

export const FEE_TYPES = ["full_payment", "partial_fee", "full_scholarship"] as const;
export type FeeType = (typeof FEE_TYPES)[number];

export const feeTypeLabels: Record<FeeType, string> = {
  full_payment: "Full Payment",
  partial_fee: "Partial Fee",
  full_scholarship: "Full Scholarship",
};

/** Money as an exact decimal string (numeric(12,2)), never a float. */
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const MONEY_MESSAGE = "Enter an amount like 25 or 25.50.";

/** "" becomes null; otherwise an amount above 0. */
const optionalPositiveMoney = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .regex(MONEY_PATTERN, { error: MONEY_MESSAGE, abort: true })
      .refine((value) => /[1-9]/.test(value), "The amount must be more than 0.")
      .nullable(),
  )
  .nullish();

/**
 * Student registration (product owner, 2026-10-18). Required: full name,
 * gender, date of birth, class, academic year, admission date, guardian name,
 * guardian phone, fee type (with the amount they pay, except for a Full
 * Scholarship) and the
 * registration fee (0 allowed). Optional: student phone, address and photo.
 */
export const studentInputSchema = z
  .object({
    fullName: z
      .string({ error: "Enter the full name." })
      .trim()
      .min(2, "Enter the full name.")
      .max(200, "Use at most 200 characters."),
    gender: z.enum(["male", "female"], { error: "Choose a gender." }),
    dateOfBirth: requiredDate("Enter the date of birth.")
      .refine((value) => value <= todayIso(), "Date of birth cannot be in the future.")
      .refine((value) => value >= "1900-01-01", "Enter a valid date of birth."),
    classId: requiredId("Choose a class."),
    academicYearId: requiredId("Choose an academic year."),
    admissionDate: requiredDate("Enter the admission date.").refine(
      (value) => value <= todayIso(),
      "Admission date cannot be in the future.",
    ),
    guardianName: requiredText("Enter the guardian's name.", 200),
    guardianPhone: requiredText("Enter the guardian's phone number.", 40),
    phone: optionalText(40),
    address: optionalText(500),
    status: z.enum(STUDENT_STATUSES, { error: "Choose a status." }).default("active"),
    feeType: z.enum(FEE_TYPES, { error: "Choose a fee type." }),
    feeAmount: optionalPositiveMoney,
    registrationFee: z
      .string({ error: "Enter the registration fee (0 if none)." })
      .trim()
      .min(1, { error: "Enter the registration fee (0 if none).", abort: true })
      .regex(MONEY_PATTERN, MONEY_MESSAGE),
    registrationFeePaid: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.admissionDate < value.dateOfBirth) {
      ctx.addIssue({
        code: "custom",
        path: ["admissionDate"],
        message: "Admission date must be after the date of birth.",
      });
    }
  })
  // Checked even when other fields are invalid, so the form shows it at once.
  .refine((value) => value.feeType === "full_scholarship" || value.feeAmount != null, {
    path: ["feeAmount"],
    error: "Enter the amount the student pays.",
    when: (payload) =>
      !payload.issues.some((i) => i.path?.[0] === "feeType" || i.path?.[0] === "feeAmount"),
  })
  .transform((value) => ({
    ...value,
    // A Full Scholarship has no amount; a registration fee of 0 cannot be paid.
    feeAmount: value.feeType === "full_scholarship" ? null : (value.feeAmount ?? null),
    registrationFeePaid: /[1-9]/.test(value.registrationFee) && value.registrationFeePaid,
  }));

export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentListFilterSchema = z.object({
  status: z.enum(STUDENT_STATUSES).optional().catch(undefined),
  classId: uuidSchema.optional().catch(undefined),
  academicYearId: uuidSchema.optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

/** "STU-0001" from 1. */
export function formatStudentNumber(n: number) {
  return `STU-${String(n).padStart(4, "0")}`;
}
