"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import {
  createAcademicYear,
  deleteAcademicYear,
  makeAcademicYearCurrent,
  updateAcademicYear,
} from "./repository";

const PATH = "/academic-years";

function yearInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    status: field(formData, "status") || "upcoming",
  };
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/dashboard");
}

export async function createAcademicYearAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("academic_years.manage", async (ctx) => {
    await createAcademicYear(ctx, yearInput(formData));
  });
  if (result.ok) refresh();
  return toFormResult(result, "Academic year added.");
}

export async function updateAcademicYearAction(
  yearId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("academic_years.manage", async (ctx) => {
    await updateAcademicYear(ctx, yearId, yearInput(formData));
  });
  if (result.ok) refresh();
  return toFormResult(result, "Academic year saved.");
}

export async function makeAcademicYearCurrentAction(yearId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("academic_years.manage", async (ctx) => {
    await makeAcademicYearCurrent(ctx, yearId);
  });
  if (result.ok) refresh();
  return toFormResult(result);
}

export async function deleteAcademicYearAction(yearId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("academic_years.manage", (ctx) =>
    deleteAcademicYear(ctx, yearId),
  );
  if (result.ok) refresh();
  return toFormResult(result);
}
