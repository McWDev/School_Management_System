"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { archiveBranch, createBranch, restoreBranch, updateBranch } from "./repository";

const PATH = "/settings/branches";

function branchInput(formData: FormData) {
  return {
    branchCode: field(formData, "branchCode"),
    name: field(formData, "name"),
    address: field(formData, "address"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
  };
}

export async function createBranchAction(
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("branches.create", async (ctx) => {
    await createBranch(ctx, branchInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Branch created.");
}

export async function updateBranchAction(
  branchId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("branches.update", async (ctx) => {
    await updateBranch(ctx, branchId, branchInput(formData));
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result, "Branch updated.");
}

export async function archiveBranchAction(branchId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("branches.archive", async (ctx) => {
    await archiveBranch(ctx, branchId);
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}

export async function restoreBranchAction(branchId: string): Promise<FormResult<unknown>> {
  const result = await tenantAction("branches.archive", async (ctx) => {
    await restoreBranch(ctx, branchId);
  });
  if (result.ok) revalidatePath(PATH);
  return toFormResult(result);
}
