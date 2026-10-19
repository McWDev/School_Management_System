import { z } from "zod";

/** The code is given by the system (formatSubjectCode), so only the name is entered. */
export const subjectInputSchema = z.object({
  name: z
    .string({ error: "Enter the subject name." })
    .trim()
    .min(1, "Enter the subject name.")
    .max(80, "Use at most 80 characters."),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const subjectListFilterSchema = z.object({
  status: z.enum(["active", "inactive"]).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

/** "SUB-001" from 1. */
export function formatSubjectCode(n: number) {
  return `SUB-${String(n).padStart(3, "0")}`;
}

/** Assign a teacher: a staff id, or "" to clear. */
export const assignTeacherSchema = z.object({
  staffId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(z.uuid("Choose a teacher.").nullable()),
});
