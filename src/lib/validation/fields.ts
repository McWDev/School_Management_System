import { z } from "zod";

/** School/branch code: upper-cased, then checked (matches CODE_PATTERN_SQL). */
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9-]{0,19}$/,
    "Use 1–20 letters, digits or hyphens, starting with a letter or digit.",
  );

/** Optional free text: trimmed, "" becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullish();

/** Optional email: trimmed and lower-cased before validation, "" becomes null. */
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => (value === "" ? null : value))
  .nullish();

/** IANA time zone name supported by the runtime. */
export const timezoneSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone, e.g. Africa/Mogadishu.");

/** ISO 4217 currency code. */
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code, e.g. USD.");

export const uuidSchema = z.uuid("Invalid identifier.");
