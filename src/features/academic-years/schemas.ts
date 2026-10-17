import { z } from "zod";

export const ACADEMIC_YEAR_STATUSES = ["upcoming", "current", "closed"] as const;

export const academicYearStatusLabels: Record<(typeof ACADEMIC_YEAR_STATUSES)[number], string> = {
  upcoming: "Upcoming",
  current: "Current",
  closed: "Closed",
};

export const academicYearInputSchema = z.object({
  name: z
    .string({ error: "Enter the academic year name." })
    .trim()
    .min(1, "Enter the academic year name.")
    .max(40, "Use at most 40 characters."),
  status: z.enum(ACADEMIC_YEAR_STATUSES, { error: "Choose a status." }).default("upcoming"),
});

export const academicYearListFilterSchema = z.object({
  status: z.enum(ACADEMIC_YEAR_STATUSES).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export type AcademicYearInput = z.input<typeof academicYearInputSchema>;
