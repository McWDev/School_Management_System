"use server";

import { revalidatePath } from "next/cache";
import { createSchoolAdmin } from "@/features/users/repository";
import { resetPasswordUrl } from "@/lib/app-url";
import { platformAction, tenantAction } from "@/lib/authz";
import { ValidationError } from "@/lib/errors";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { LOGO_MAX_BYTES } from "./logo";
import {
  changeSchoolStatus,
  registerSchool,
  removeSchoolLogo,
  setSchoolLogo,
  updateSchoolProfile,
} from "./repository";
import type { TenantStatusAction } from "./status";

const PROFILE_PATH = "/settings/school-profile";
const REGISTRATIONS_PATH = "/settings/school-registrations";

export type SchoolLinkResult = { url: string; expiresAt: string } | null;

// ----------------------------------------------------------- school profile

export async function updateSchoolProfileAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("settings.manage", async (ctx) => {
    await updateSchoolProfile(ctx, {
      name: field(formData, "name"),
      legalName: field(formData, "legalName"),
      managerName: field(formData, "managerName"),
      contactEmail: field(formData, "contactEmail"),
      phone: field(formData, "phone"),
      website: field(formData, "website"),
      address: field(formData, "address"),
      motto: field(formData, "motto"),
    });
  });
  if (result.ok) revalidatePath(PROFILE_PATH);
  return toFormResult(result, "School profile saved.");
}

export async function uploadSchoolLogoAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("settings.manage", async (ctx) => {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Choose an image file.", { logo: ["Choose an image file."] });
    }
    // Reject oversized uploads before reading them into memory.
    if (file.size > LOGO_MAX_BYTES) {
      throw new ValidationError("The logo must be 1 MB or smaller.", {
        logo: ["The logo must be 1 MB or smaller."],
      });
    }
    await setSchoolLogo(ctx, new Uint8Array(await file.arrayBuffer()));
  });
  if (result.ok) revalidatePath(PROFILE_PATH);
  return toFormResult(result, "Logo updated.");
}

export async function removeSchoolLogoAction(): Promise<FormResult<unknown>> {
  const result = await tenantAction("settings.manage", (ctx) => removeSchoolLogo(ctx));
  if (result.ok) revalidatePath(PROFILE_PATH);
  return toFormResult(result);
}

// ---------------------------------------------------------- registrations

/** Register a school; optionally create its first School Admin and return their setup link. */
export async function registerSchoolAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<SchoolLinkResult>> {
  const adminEmail = field(formData, "adminEmail").trim();
  const adminName = field(formData, "adminName").trim();
  const result = await platformAction("schools.create", async (ctx) => {
    const school = await registerSchool(ctx, {
      schoolCode: field(formData, "schoolCode"),
      name: field(formData, "name"),
      contactEmail: field(formData, "contactEmail"),
      phone: field(formData, "phone"),
      address: field(formData, "address"),
      currencyCode: field(formData, "currencyCode"),
      timezone: field(formData, "timezone"),
    });
    if (!adminEmail) return null;
    const { setup } = await createSchoolAdmin(ctx, school.id, {
      email: adminEmail,
      fullName: adminName,
    });
    return { url: await resetPasswordUrl(setup.token), expiresAt: setup.expiresAt.toISOString() };
  });
  revalidatePath(REGISTRATIONS_PATH);
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
  if (result.ok) revalidatePath(REGISTRATIONS_PATH);
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
