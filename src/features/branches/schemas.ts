import { z } from "zod";
import { codeSchema, optionalEmail, optionalText } from "@/lib/validation/fields";

export const branchInputSchema = z.object({
  branchCode: codeSchema,
  name: z.string().trim().min(2, "Enter the branch name.").max(200),
  address: optionalText(500),
  phone: optionalText(40),
  email: optionalEmail,
});

export const branchListFilterSchema = z.object({
  status: z.enum(["active", "archived"]).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export type BranchInput = z.input<typeof branchInputSchema>;
