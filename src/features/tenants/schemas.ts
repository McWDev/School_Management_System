import { z } from "zod";
import {
  codeSchema,
  currencyCodeSchema,
  optionalEmail,
  optionalText,
  timezoneSchema,
} from "@/lib/validation/fields";

/** Optional website: http(s) only; "school.so" becomes "https://school.so". */
export const optionalWebsite = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value && !/^[a-z]+:\/\//i.test(value) ? `https://${value}` : value))
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Enter a valid website, e.g. www.school.so.")
  .transform((value) => (value === "" ? null : value))
  .nullish();

/**
 * The school's profile — the letterhead on report sheets and letters.
 * Editable by the school (settings.manage); never includes status or code.
 */
export const schoolProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the school name.").max(200),
  legalName: optionalText(200),
  managerName: optionalText(200),
  contactEmail: optionalEmail,
  phone: optionalText(40),
  website: optionalWebsite,
  address: optionalText(500),
  motto: optionalText(200),
});

/** New school registration (platform onboarding). */
export const schoolRegistrationSchema = z.object({
  schoolCode: codeSchema,
  name: z.string().trim().min(2, "Enter the school name.").max(200),
  contactEmail: optionalEmail,
  phone: optionalText(40),
  address: optionalText(500),
  currencyCode: currencyCodeSchema,
  timezone: timezoneSchema,
});

export const statusChangeSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reactivate", "archive"]),
  reason: z.string().trim().max(1000).optional(),
});

export const schoolListFilterSchema = z.object({
  status: z.enum(["pending", "active", "suspended", "archived"]).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export type SchoolProfileInput = z.input<typeof schoolProfileSchema>;
export type SchoolRegistrationInput = z.input<typeof schoolRegistrationSchema>;
export type StatusChangeInput = z.input<typeof statusChangeSchema>;
