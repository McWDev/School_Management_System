"use server";

import { revalidatePath } from "next/cache";
import { resetPasswordUrl } from "@/lib/app-url";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import {
  createSchoolUser,
  createSchoolUserResetLink,
  setSchoolUserStatus,
  updateSchoolUser,
} from "./repository";

const PATH = "/settings/users";

export type LinkResult = { url: string; expiresAt: string };

function accessInput(formData: FormData) {
  return {
    roleIds: formData.getAll("roleIds").map(String),
    allBranches: formData.get("allBranches") === "on",
    branchIds: formData.getAll("branchIds").map(String),
  };
}

export async function createUserAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<LinkResult>> {
  const result = await tenantAction("users.manage", async (ctx) => {
    const { setup } = await createSchoolUser(ctx, {
      email: field(formData, "email"),
      fullName: field(formData, "fullName"),
      ...accessInput(formData),
    });
    return { url: await resetPasswordUrl(setup.token), expiresAt: setup.expiresAt.toISOString() };
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function updateUserAction(
  userId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("users.manage", (ctx) =>
    updateSchoolUser(ctx, userId, {
      fullName: field(formData, "fullName"),
      ...accessInput(formData),
    }),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function disableUserAction(userId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("users.manage", (ctx) =>
    setSchoolUserStatus(ctx, userId, "disabled"),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function enableUserAction(userId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("users.manage", (ctx) =>
    setSchoolUserStatus(ctx, userId, "active"),
  );
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function resetLinkAction(userId: string): Promise<FormResult<LinkResult>> {
  const result = await tenantAction("users.manage", async (ctx) => {
    const link = await createSchoolUserResetLink(ctx, userId);
    return { url: await resetPasswordUrl(link.token), expiresAt: link.expiresAt.toISOString() };
  });
  return toFormResult(result);
}
