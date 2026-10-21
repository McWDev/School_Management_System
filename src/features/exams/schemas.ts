import { z } from "zod";
import { uuidSchema } from "@/lib/validation/fields";

/** The three parts of a subject's marks and their maximums (product owner, 2026-10-19). */
export const MARK_PARTS = [
  { key: "midterm", label: "Midterm", max: 30 },
  { key: "activities", label: "Activities", max: 20 },
  { key: "final", label: "Final", max: 50 },
] as const;
export type MarkPart = (typeof MARK_PARTS)[number]["key"];

/** A subject total is out of 100; an average of 50 or more passes. */
export const SUBJECT_MAX = 100;
export const PASS_MARK = 50;

/** Which class (and year) to work on, from the page's search params. */
export const examSelectionSchema = z.object({
  academicYearId: uuidSchema.optional().catch(undefined),
  classId: uuidSchema.optional().catch(undefined),
  subjectId: uuidSchema.optional().catch(undefined),
});

const markText = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,2}(\.\d{1,2})?$/.test(value), {
    error: "Enter marks like 25 or 25.5.",
  });

/** Marks of one class in one subject; "" leaves a part empty. */
export const marksInputSchema = z.object({
  entries: z.array(
    z.object({
      studentId: uuidSchema,
      midterm: markText,
      activities: markText,
      final: markText,
    }),
  ),
});

/** Whole hundredths of a marks string ("25.5" → 2550). */
export function toHundredths(marks: string): number {
  const [whole, fraction = ""] = marks.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 2550 → "25.5", 2500 → "25". */
export function fromHundredths(value: number): string {
  const whole = Math.trunc(value / 100);
  const fraction = String(value % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** A subject total from its parts (missing parts count as 0), in hundredths. */
export function subjectTotal(parts: Partial<Record<MarkPart, string | null>>): number {
  return MARK_PARTS.reduce((sum, p) => sum + (parts[p.key] ? toHundredths(parts[p.key]!) : 0), 0);
}

/**
 * The average of subject totals (each out of 100) to one decimal place,
 * rounded down with whole numbers only so it never shows a pass that is not
 * one, e.g. totals 90 and 45.5 → "67.7", 50 and 49.9 → "49.9".
 */
export function average(totalsHundredths: number[]): string {
  if (totalsHundredths.length === 0) return "0.0";
  const sum = totalsHundredths.reduce((a, b) => a + b, 0);
  // In tenths: (sum / 100) / n × 10 = sum / (n × 10).
  const tenths = Math.floor(sum / (totalsHundredths.length * 10));
  return `${Math.trunc(tenths / 10)}.${tenths % 10}`;
}

/**
 * Pass when the exact average of the subject totals is 50 or more.
 */
export function passes(totalsHundredths: number[]) {
  if (totalsHundredths.length === 0) return false;
  const sum = totalsHundredths.reduce((a, b) => a + b, 0);
  return sum >= PASS_MARK * 100 * totalsHundredths.length;
}

/** One student's marks in several subjects; "" leaves a part empty. */
export const studentMarksInputSchema = z.object({
  entries: z.array(
    z.object({
      subjectId: uuidSchema,
      midterm: markText,
      activities: markText,
      final: markText,
    }),
  ),
});
