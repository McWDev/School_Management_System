"use server";

import { revalidatePath } from "next/cache";
import { createSchoolAdmin } from "@/features/users/repository";
import { resetPasswordUrl } from "@/lib/app-url";
import { platformAction, tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { changeSchoolStatus, registerSchool, updateOwnSchoolDetails } from "./repository";
import type { TenantStatusAction } from "./status";

const PATH = "/settings/school-profile";

export type SchoolLinkResult = { url: string; expiresAt: string } | null;

function detailsInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    legalName: field(formData, "legalName"),
    contactEmail: field(formData, "contactEmail"),
    phone: field(formData, "phone"),
    address: field(formData, "address"),
    currencyCode: field(formData, "currencyCode"),
    timezone: field(formData, "timezone"),
  };
}

/** Register a school; optionally create its first School Admin and return their setup link. */
export async function registerSchoolAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<SchoolLinkResult>> {
  const adminEmail = field(formData, "adminEmail").trim();
  const adminName = field(formData, "adminName").trim();
  const result = await platformAction("schools.create", async (ctx) => {
    const school = await registerSchool(ctx, {
      ...detailsInput(formData),
      schoolCode: field(formData, "schoolCode"),
    });
    if (!adminEmail) return null;
    const { setup } = await createSchoolAdmin(ctx, school.id, {
      email: adminEmail,
      fullName: adminName,
    });
    return { url: await resetPasswordUrl(setup.token), expiresAt: setup.expiresAt.toISOString() };
  });
  revalidatePath(PATH);
  return toFormResult(result);
}

export async function changeSchoolStatusAction(
  schoolId: string,
  action: TenantStatusAction,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const permission =
    action === "approve" || action === "reactivate" ? "schools.activate" : "schools.suspend";
  const result = await platformAction(permission, async (ctx) => {
    await changeSchoolStatus(ctx, schoolId, {
      action,
      reason: field(formData, "reason") || undefined,
    });
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function createSchoolAdminAction(
  schoolId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<SchoolLinkResult>> {
  const result = await platformAction("schools.update", async (ctx) => {
    const { setup } = await createSchoolAdmin(ctx, schoolId, {
      email: field(formData, "email"),
      fullName: field(formData, "fullName"),
    });
    return { url: await resetPasswordUrl(setup.token), expiresAt: setup.expiresAt.toISOString() };
  });
  return toFormResult(result);
}

export async function updateOwnSchoolAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("settings.manage", async (ctx) => {
    await updateOwnSchoolDetails(ctx, detailsInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "School profile saved.");
}
