"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { ValidationError } from "@/lib/errors";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { IMAGE_MAX_BYTES } from "@/lib/images";
import {
  createStaff,
  createWorkType,
  deleteStaff,
  deleteWorkType,
  renameWorkType,
  updateStaff,
} from "./repository";

const PATH = "/staff";

function staffInput(formData: FormData) {
  return {
    fullName: field(formData, "fullName"),
    workTypeId: field(formData, "workTypeId"),
    gender: field(formData, "gender"),
    dateOfBirth: field(formData, "dateOfBirth"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    address: field(formData, "address"),
    location: field(formData, "location"),
    hireDate: field(formData, "hireDate"),
    status: field(formData, "status") || "active",
  };
}

/** Optional login access (username + password) from the staff form. */
function loginInput(formData: FormData) {
  return { username: field(formData, "username"), password: field(formData, "password") };
}

/** The uploaded photo, or null when none was chosen. Size is checked before reading. */
async function photoFrom(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > IMAGE_MAX_BYTES) {
    throw new ValidationError("The photo must be 1 MB or smaller.", {
      photo: ["The photo must be 1 MB or smaller."],
    });
  }
  return new Uint8Array(await file.arrayBuffer());
}

export async function createStaffAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", async (ctx) => {
    await createStaff(ctx, staffInput(formData), await photoFrom(formData), loginInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Staff member added.");
}

export async function updateStaffAction(
  staffId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", async (ctx) => {
    await updateStaff(ctx, staffId, staffInput(formData), {
      photo: await photoFrom(formData),
      removePhoto: formData.get("removePhoto") === "on",
      login: loginInput(formData),
    });
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Staff member saved.");
}

export async function createWorkTypeAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", async (ctx) => {
    await createWorkType(ctx, { name: field(formData, "name") });
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Work type added.");
}

export async function renameWorkTypeAction(
  workTypeId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", (ctx) =>
    renameWorkType(ctx, workTypeId, { name: field(formData, "name") }),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Work type renamed.");
}

export async function deleteWorkTypeAction(workTypeId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", (ctx) => deleteWorkType(ctx, workTypeId));
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function deleteStaffAction(staffId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", (ctx) => deleteStaff(ctx, staffId));
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}
