import { z } from "zod";

/** Largest class allowed (keeps typos like 4000 out). */
export const MAX_CLASS_SEATS = 500;

export const classInputSchema = z.object({
  name: z
    .string({ error: "Enter the class name." })
    .trim()
    .min(1, "Enter the class name.")
    .max(80, "Use at most 80 characters."),
  /** How many students can learn in this class. */
  seats: z
    .string({ error: "Enter the number of seats." })
    .trim()
    .min(1, { error: "Enter the number of seats.", abort: true })
    .regex(/^\d+$/, "Enter a whole number of seats.")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "A class needs at least 1 seat.")
        .max(MAX_CLASS_SEATS, `Use at most ${MAX_CLASS_SEATS} seats.`),
    ),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const classListFilterSchema = z.object({
  status: z.enum(["active", "inactive"]).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export type ClassInput = z.input<typeof classInputSchema>;
