import { z } from "zod";
import { uuidSchema } from "@/lib/validation/fields";

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address."));

/** Role and branch access for a school user. */
export const userAccessSchema = z
  .object({
    roleIds: z.array(uuidSchema).min(1, "Choose at least one role.").max(20),
    allBranches: z.boolean(),
    branchIds: z.array(uuidSchema).max(200).default([]),
  })
  .refine((value) => value.allBranches || value.branchIds.length > 0, {
    path: ["branchIds"],
    message: "Choose at least one branch, or give access to all branches.",
  });

export const createSchoolUserSchema = z
  .object({
    email: emailField,
    fullName: z.string().trim().min(2, "Enter the full name.").max(200),
  })
  .and(userAccessSchema);

export const updateSchoolUserSchema = z
  .object({ fullName: z.string().trim().min(2, "Enter the full name.").max(200) })
  .and(userAccessSchema);

export const userListFilterSchema = z.object({
  status: z.enum(["active", "disabled"]).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export const schoolAdminSchema = z.object({
  email: emailField,
  fullName: z.string().trim().min(2, "Enter the full name.").max(200),
});
