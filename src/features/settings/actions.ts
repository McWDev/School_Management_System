"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { updateGeneralSettings } from "./repository";

export async function updateGeneralSettingsAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("settings.manage", async (ctx) => {
    await updateGeneralSettings(ctx, {
      passMark: field(formData, "passMark"),
      midtermMax: field(formData, "midtermMax"),
      activitiesMax: field(formData, "activitiesMax"),
      finalMax: field(formData, "finalMax"),
      studentPrefix: field(formData, "studentPrefix"),
      receiptPrefix: field(formData, "receiptPrefix"),
      payslipPrefix: field(formData, "payslipPrefix"),
    });
  });
  // Exam pages and numbers use these settings.
  if (result.ok) revalidatePath("/", "layout");
  return toFormResult(result, "Settings saved.");
}
