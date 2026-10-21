"use server";

import { revalidatePath } from "next/cache";
import { requireAccess, tenantAction } from "@/lib/authz";
import { toActionError } from "@/lib/errors";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import {
  changeOwnPassword,
  resetPortalPassword,
  setPortalAccess,
  type PortalCredential,
} from "./repository";

const PATH = "/settings/students-portal";

export async function resetPortalPasswordAction(
  studentId: string,
): Promise<FormResult<Omit<PortalCredential, "studentId" | "className">>> {
  const result = await tenantAction("students.update", (ctx) =>
    resetPortalPassword(ctx, studentId),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "New password created.");
}

export async function setPortalAccessAction(
  studentId: string,
  enabled: boolean,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("students.update", (ctx) =>
    setPortalAccess(ctx, studentId, enabled),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

/** Any signed-in user changing their own password (used by the portal). */
export async function changeOwnPasswordAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  // Outside the try: a signed-out user is redirected to sign in.
  const access = await requireAccess();
  try {
    await changeOwnPassword(access.user, {
      currentPassword: field(formData, "currentPassword"),
      newPassword: field(formData, "newPassword"),
      confirmPassword: field(formData, "confirmPassword"),
    });
    return { status: "success", data: undefined, message: "Your password is changed." };
  } catch (error) {
    return toFormResult(toActionError(error));
  }
}
