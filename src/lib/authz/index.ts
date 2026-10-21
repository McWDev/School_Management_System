import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, ForbiddenError, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Permission } from "@/lib/permissions/catalog";
import type { PlatformContext, TenantContext } from "@/lib/tenant-context";
import { loadAccessForUser, type Access } from "./load";

export type { Access } from "./load";

/*
 * Authorization entry points for pages and server actions. Every protected
 * read and write goes through one of these; repositories then re-check the
 * permission and the tenant/branch scope themselves.
 */

/** Access for the current request, or null when signed out. Deduplicated per request. */
export const getAccess = cache(async (): Promise<Access | null> => {
  const user = await getCurrentUser();
  return user ? loadAccessForUser(user) : null;
});

/** Access for the current request, or a redirect to /login. */
export async function requireAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/login");
  return access;
}

/** School context with `permission`, or null (render a "no access" state). */
export async function getTenantContextFor(permission: Permission): Promise<TenantContext | null> {
  const access = await requireAccess();
  return access.tenant?.permissions.has(permission) ? access.tenant : null;
}

export async function getPlatformContextFor(
  permission: Permission,
): Promise<PlatformContext | null> {
  const access = await requireAccess();
  return access.platform?.permissions.has(permission) ? access.platform : null;
}

/**
 * Run a server action body with a school context holding `permission`.
 * Converts errors into a safe ActionResult; unexpected errors are logged.
 */
export async function tenantAction<T>(
  permission: Permission | readonly Permission[],
  body: (ctx: TenantContext) => Promise<T>,
): Promise<ActionResult<T>> {
  // A list means any one of the permissions is enough; the body checks the rest.
  const allowed: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  return runAction(async () => {
    const access = await getAccess();
    const ctx = access?.tenant;
    if (!ctx || !allowed.some((p) => ctx.permissions.has(p))) throw new ForbiddenError();
    return body(ctx);
  });
}

/** Same as tenantAction for platform operations. */
export async function platformAction<T>(
  permission: Permission,
  body: (ctx: PlatformContext) => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(async () => {
    const access = await getAccess();
    const ctx = access?.platform;
    if (!ctx || !ctx.permissions.has(permission)) throw new ForbiddenError();
    return body(ctx);
  });
}

async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (!(error instanceof AppError)) logger.error("action.failed", { error });
    return toActionError(error);
  }
}
