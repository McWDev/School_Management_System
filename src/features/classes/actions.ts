"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { createClass, deleteClass, updateClass } from "./repository";

const PATH = "/classes";

function classInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    seats: field(formData, "seats"),
    status: field(formData, "status") || "active",
  };
}

export async function createClassAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("classes.manage", async (ctx) => {
    await createClass(ctx, classInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Class added.");
}

export async function updateClassAction(
  classId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("classes.manage", async (ctx) => {
    await updateClass(ctx, classId, classInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Class saved.");
}

export async function deleteClassAction(classId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("classes.manage", (ctx) => deleteClass(ctx, classId));
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}
