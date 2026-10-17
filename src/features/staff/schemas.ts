import { z } from "zod";
import { optionalEmail, optionalText, uuidSchema } from "@/lib/validation/fields";

/** Optional ISO date (YYYY-MM-DD); "" becomes null. */
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date.")
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    "Enter a valid date.",
  )
  .transform((value) => (value === "" ? null : value))
  .nullish();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const staffInputSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the full name.").max(200),
    workTypeId: z.string().trim().min(1, "Choose a work type.").pipe(z.uuid("Choose a work type.")),
    gender: z
      .enum(["male", "female", ""])
      .transform((value) => (value === "" ? null : value))
      .nullish(),
    dateOfBirth: optionalDate,
    phone: optionalText(40),
    email: optionalEmail,
    address: optionalText(500),
    location: optionalText(200),
    hireDate: optionalDate,
    status: z.enum(["active", "left"]).default("active"),
  })
  .superRefine((value, ctx) => {
    if (value.dateOfBirth && value.dateOfBirth > todayIso()) {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Date of birth cannot be in the future.",
      });
    }
    if (value.dateOfBirth && value.dateOfBirth < "1900-01-01") {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Enter a valid date of birth.",
      });
    }
    if (value.hireDate && value.dateOfBirth && value.hireDate < value.dateOfBirth) {
      ctx.addIssue({
        code: "custom",
        path: ["hireDate"],
        message: "Hire date must be after the date of birth.",
      });
    }
  });

export const workTypeInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a work type name.").max(80),
});

export const staffListFilterSchema = z.object({
  status: z.enum(["active", "left"]).optional().catch(undefined),
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
