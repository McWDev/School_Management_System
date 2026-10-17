import { z } from "zod";
import {
  codeSchema,
  currencyCodeSchema,
  optionalEmail,
  optionalText,
  timezoneSchema,
} from "@/lib/validation/fields";

/** Fields a school can edit about itself (never status). */
export const schoolDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the school name.").max(200),
  legalName: optionalText(200),
  contactEmail: optionalEmail,
  phone: optionalText(40),
  address: optionalText(500),
  currencyCode: currencyCodeSchema,
  timezone: timezoneSchema,
});

/** New school registration (platform onboarding). */
export const schoolRegistrationSchema = schoolDetailsSchema.extend({ schoolCode: codeSchema });

export const statusChangeSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reactivate", "archive"]),
  reason: z.string().trim().max(1000).optional(),
});

export const schoolListFilterSchema = z.object({
  status: z.enum(["pending", "active", "suspended", "archived"]).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export type SchoolDetailsInput = z.input<typeof schoolDetailsSchema>;
export type SchoolRegistrationInput = z.input<typeof schoolRegistrationSchema>;
export type StatusChangeInput = z.input<typeof statusChangeSchema>;
