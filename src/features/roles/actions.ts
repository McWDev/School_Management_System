"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { createRole, updateRole } from "./repository";

const PATH = "/settings/roles";

function roleInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    description: field(formData, "description"),
    permissions: formData.getAll("permissions").map(String),
  };
}

export async function createRoleAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("roles.manage", async (ctx) => {
    await createRole(ctx, roleInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function updateRoleAction(
  roleId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("roles.manage", (ctx) =>
    updateRole(ctx, roleId, roleInput(formData)),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}
