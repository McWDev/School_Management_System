import { z } from "zod";
import { uuidSchema } from "@/lib/validation/fields";

/** Filters of the Students Portal page (invalid values are ignored). */
export const portalFilterSchema = z.object({
  academicYearId: uuidSchema.optional().catch(undefined),
  classId: uuidSchema.optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  access: z.enum(["none", "active", "disabled"]).optional().catch(undefined),
});

export const portalStudentIdsSchema = z.object({
  studentIds: z.array(uuidSchema).min(1, "Tick at least one student."),
});

/** A Students Portal password: exactly 6 digits. */
export const portalPasswordSchema = z
  .string({ error: "Enter a 6-digit password." })
  .regex(/^\d{6}$/, "Use exactly 6 digits (0–9).");

/** A signed-in student changing their own portal password. */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password." })
      .min(1, "Enter your current password."),
    newPassword: portalPasswordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The two new passwords are not the same.",
      });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choose a password different from the current one.",
      });
    }
  });
