import { z } from "zod";
import { optionalEmail, optionalText, uuidSchema } from "@/lib/validation/fields";

/** Required ISO date (YYYY-MM-DD). `message` is shown when it is missing. */
const requiredDate = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date.")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Enter a valid date.");

/** Youngest allowed staff age (product owner, 2026-10-17). */
export const MIN_STAFF_AGE = 15;

/**
 * "Today" as the latest calendar date anywhere (UTC+14), so a user's local
 * today is never rejected as "in the future" whatever their time zone.
 */
export function todayIso() {
  return new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10);
}

export const staffInputSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the full name.").max(200),
    workTypeId: z.string().trim().min(1, "Choose a work type.").pipe(z.uuid("Choose a work type.")),
    // Required (product owner, 2026-10-17): phone, gender, date of birth,
    // hire date and location, as well as full name and work type.
    gender: z.enum(["male", "female"], { error: "Choose a gender." }),
    // Field-level checks run even when other fields are invalid, so the form
    // shows every problem at once.
    dateOfBirth: requiredDate("Enter the date of birth.")
      .refine((value) => value <= todayIso(), "Date of birth cannot be in the future.")
      .refine((value) => value >= "1900-01-01", "Enter a valid date of birth.")
      .refine((value) => {
        const age = ageFrom(value);
        return age === null || age >= MIN_STAFF_AGE;
      }, `Staff must be at least ${MIN_STAFF_AGE} years old.`),
    phone: z
      .string({ error: "Enter the phone number." })
      .trim()
      .min(1, "Enter the phone number.")
      .max(40),
    email: optionalEmail,
    address: optionalText(500),
    location: z
      .string({ error: "Enter the location." })
      .trim()
      .min(1, "Enter the location.")
      .max(200),
    hireDate: requiredDate("Enter the hire date.").refine(
      (value) => value <= todayIso(),
      "Hire date cannot be in the future.",
    ),
    status: z.enum(["active", "inactive", "left"]).default("active"),
  })
  .superRefine((value, ctx) => {
    if (value.hireDate < value.dateOfBirth) {
      ctx.addIssue({
        code: "custom",
        path: ["hireDate"],
        message: "Hire date must be after the date of birth.",
      });
    }
  });

/** Login access for a staff member: a school-chosen username and password. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,39}$/,
    "Use 3–40 letters, digits, dots, hyphens or underscores (no spaces).",
  );

export const workTypeInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a work type name.").max(80),
});

export const staffListFilterSchema = z.object({
  status: z.enum(["active", "inactive", "left"]).optional().catch(undefined),
  workTypeId: uuidSchema.optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

/** Whole years between a date of birth and `on` (default today), or null. */
export function ageFrom(
  dateOfBirth: string | null | undefined,
  on: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = on.getUTCFullYear() - y;
  const beforeBirthday =
    on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
