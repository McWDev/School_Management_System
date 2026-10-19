"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { assignSubjectTeacher, createSubject, deleteSubject, updateSubject } from "./repository";

const PATH = "/subjects";

function subjectInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    status: field(formData, "status") || "active",
  };
}

export async function createSubjectAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("courses.manage", async (ctx) => {
    await createSubject(ctx, subjectInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Subject added.");
}

export async function updateSubjectAction(
  subjectId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("courses.manage", async (ctx) => {
    await updateSubject(ctx, subjectId, subjectInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Subject saved.");
}

export async function deleteSubjectAction(subjectId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("courses.manage", (ctx) => deleteSubject(ctx, subjectId));
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function assignTeacherAction(
  subjectId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("courses.manage", async (ctx) => {
    await assignSubjectTeacher(ctx, subjectId, { staffId: field(formData, "staffId") });
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Teacher saved.");
}
