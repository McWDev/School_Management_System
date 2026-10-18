"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { ValidationError } from "@/lib/errors";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { IMAGE_MAX_BYTES } from "@/lib/images";
import { createStudent, deleteStudent, updateStudent } from "./repository";

function studentInput(formData: FormData) {
  return {
    fullName: field(formData, "fullName"),
    gender: field(formData, "gender"),
    dateOfBirth: field(formData, "dateOfBirth"),
    classId: field(formData, "classId"),
    academicYearId: field(formData, "academicYearId"),
    admissionDate: field(formData, "admissionDate"),
    guardianName: field(formData, "guardianName"),
    guardianPhone: field(formData, "guardianPhone"),
    phone: field(formData, "phone"),
    address: field(formData, "address"),
    status: field(formData, "status") || "active",
    feeType: field(formData, "feeType"),
    feeAmount: field(formData, "feeAmount"),
    registrationFee: field(formData, "registrationFee"),
    registrationFeePaid: formData.get("registrationFeePaid") === "on",
  };
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

/** Student counts appear on these pages too. */
function revalidate() {
  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
}

export async function createStudentAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("students.create", async (ctx) => {
    await createStudent(ctx, studentInput(formData), {
      photo: await photoFrom(formData),
      confirmDuplicate: formData.get("confirmDuplicate") === "on",
    });
  });
  if (result.ok) revalidate();
  return toFormResult(result, "Student registered.");
}

export async function updateStudentAction(
  studentId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("students.update", async (ctx) => {
    await updateStudent(ctx, studentId, studentInput(formData), {
      photo: await photoFrom(formData),
      removePhoto: formData.get("removePhoto") === "on",
    });
  });
  if (result.ok) revalidate();
  return toFormResult(result, "Student saved.");
}

export async function deleteStudentAction(studentId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("students.archive", (ctx) => deleteStudent(ctx, studentId));
  if (result.ok) revalidate();
  return toFormResult(result);
}
