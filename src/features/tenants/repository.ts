import "server-only";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { schoolLogos, tenants, type Tenant } from "@/db/schema";
import { ensureSchoolRoles } from "@/features/roles/presets";
import { ensureStarterWorkTypes } from "@/features/staff/work-types";
import { recordAudit } from "@/lib/audit";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import type { Permission } from "@/lib/permissions/catalog";
import {
  assertAllBranches,
  assertPermission,
  type PlatformContext,
  type TenantContext,
} from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  schoolListFilterSchema,
  schoolProfileSchema,
  schoolRegistrationSchema,
  statusChangeSchema,
} from "./schemas";
import { checkLogo } from "./logo";
import { resolveTenantTransition, type TenantStatusAction } from "./status";

/*
 * Schools (tenants). Platform functions take a PlatformContext with schools.*
 * permissions; a school's own functions take a TenantContext and can only
 * ever touch ctx.tenantId. All changes are audited in the same transaction.
 */

const STATUS_ACTION_PERMISSION: Record<TenantStatusAction, Permission> = {
  approve: "schools.activate",
  reactivate: "schools.activate",
  reject: "schools.suspend",
  suspend: "schools.suspend",
  archive: "schools.suspend",
};

const STATUS_AUDIT_ACTION: Record<TenantStatusAction, string> = {
  approve: "school.approved",
  reactivate: "school.reactivated",
  reject: "school.rejected",
  suspend: "school.suspended",
  archive: "school.archived",
};

function assertPlatform(ctx: PlatformContext, permission: Permission) {
  // Guards JS callers and casts; TypeScript already rejects a TenantContext here.
  if (ctx?.kind !== "platform") throw new NotFoundError();
  assertPermission(ctx, permission);
}

function parseId(id: string): string {
  const result = uuidSchema.safeParse(id);
  if (!result.success) throw new NotFoundError();
  return result.data;
}

// ---------------------------------------------------------------- platform

/** Register a school (status pending) and create its preset roles. */
export async function registerSchool(ctx: PlatformContext, input: unknown): Promise<Tenant> {
  assertPlatform(ctx, "schools.create");
  const data = parseInput(schoolRegistrationSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ ...data, status: "pending" })
        .returning();
      await ensureSchoolRoles(tenant.id, tx);
      await ensureStarterWorkTypes(tenant.id, tx);
      await recordAudit(
        {
          tenantId: tenant.id,
          actorUserId: ctx.actorUserId,
          action: "school.registered",
          entityType: "school",
          entityId: tenant.id,
          after: tenant,
        },
        tx,
      );
      return tenant;
    });
  } catch (error) {
    if (isUniqueViolation(error, "tenants_school_code_unique")) {
      throw new ConflictError("This school code is already registered.", {
        schoolCode: ["This school code is already registered."],
      });
    }
    throw error;
  }
}

export async function listSchools(
  ctx: PlatformContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<Tenant>> {
  assertPlatform(ctx, "schools.read");
  const { status, search } = schoolListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);

  const conditions: (SQL | undefined)[] = [status ? eq(tenants.status, status) : undefined];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(or(ilike(tenants.name, pattern), ilike(tenants.schoolCode, pattern)));
  }
  const where = and(...conditions);

  const db = getDb();
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt), tenants.id)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(tenants).where(where),
  ]);
  return toPage(items, total, pageInput);
}

export async function getSchool(ctx: PlatformContext, schoolId: string): Promise<Tenant> {
  assertPlatform(ctx, "schools.read");
  const [tenant] = await getDb()
    .select()
    .from(tenants)
    .where(eq(tenants.id, parseId(schoolId)));
  if (!tenant) throw new NotFoundError();
  return tenant;
}

/** Approve, reject, suspend, reactivate or archive a school registration. */
export async function changeSchoolStatus(
  ctx: PlatformContext,
  schoolId: string,
  input: unknown,
): Promise<Tenant> {
  if (ctx?.kind !== "platform") throw new NotFoundError();
  const id = parseId(schoolId);
  const { action, reason } = parseInput(statusChangeSchema, input);
  assertPermission(ctx, STATUS_ACTION_PERMISSION[action]);

  return getDb().transaction(async (tx) => {
    // Lock the row so concurrent status changes cannot both succeed.
    const [current] = await tx.select().from(tenants).where(eq(tenants.id, id)).for("update");
    if (!current) throw new NotFoundError();

    const result = resolveTenantTransition(current.status, action, reason);
    if (!result.ok) {
      if (result.reason === "reason_required") {
        throw new ValidationError("A reason is required for this action.", {
          reason: ["Enter a reason for this action."],
        });
      }
      throw new InvalidStateError(`A ${current.status} school cannot be changed with "${action}".`);
    }

    const [updated] = await tx
      .update(tenants)
      .set({ status: result.to, statusReason: reason?.trim() || null, statusChangedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    await recordAudit(
      {
        tenantId: id,
        actorUserId: ctx.actorUserId,
        action: STATUS_AUDIT_ACTION[action],
        entityType: "school",
        entityId: id,
        before: { status: current.status },
        after: { status: updated.status },
        reason,
      },
      tx,
    );
    return updated;
  });
}

// ------------------------------------------------------------ own school

/** The actor's own school. Any member of the school may read its basic details. */
export async function getOwnSchool(ctx: TenantContext): Promise<Tenant> {
  const [tenant] = await getDb().select().from(tenants).where(eq(tenants.id, ctx.tenantId));
  if (!tenant) throw new NotFoundError();
  return tenant;
}

/** Update the school profile (letterhead). Status, code, currency and time zone are not editable here. */
export async function updateSchoolProfile(ctx: TenantContext, input: unknown): Promise<Tenant> {
  assertPermission(ctx, "settings.manage");
  assertAllBranches(ctx);
  const data = parseInput(schoolProfileSchema, input);
  return getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .for("update");
    if (!before) throw new NotFoundError();
    const [updated] = await tx
      .update(tenants)
      .set(data)
      .where(eq(tenants.id, ctx.tenantId))
      .returning();
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "school.profile_updated",
        entityType: "school",
        entityId: ctx.tenantId,
        before: pickProfile(before),
        after: pickProfile(updated),
      },
      tx,
    );
    return updated;
  });
}

function pickProfile(t: Tenant) {
  const { name, legalName, managerName, contactEmail, phone, website, address, motto } = t;
  return { name, legalName, managerName, contactEmail, phone, website, address, motto };
}

// ------------------------------------------------------------------- logo

/** Replace the school logo. Bytes are checked by content (PNG, JPEG or WebP, ≤ 1 MB). */
export async function setSchoolLogo(ctx: TenantContext, bytes: Uint8Array): Promise<void> {
  assertPermission(ctx, "settings.manage");
  assertAllBranches(ctx);
  const check = checkLogo(bytes);
  if (!check.ok) throw new ValidationError(check.message, { logo: [check.message] });
  const data = Buffer.from(bytes);
  await getDb().transaction(async (tx) => {
    await tx
      .insert(schoolLogos)
      .values({ tenantId: ctx.tenantId, contentType: check.type, byteSize: data.length, data })
      .onConflictDoUpdate({
        target: schoolLogos.tenantId,
        set: { contentType: check.type, byteSize: data.length, data, updatedAt: new Date() },
      });
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "school.logo_updated",
        entityType: "school",
        entityId: ctx.tenantId,
        after: { contentType: check.type, byteSize: data.length },
      },
      tx,
    );
  });
}

export async function removeSchoolLogo(ctx: TenantContext): Promise<void> {
  assertPermission(ctx, "settings.manage");
  assertAllBranches(ctx);
  await getDb().transaction(async (tx) => {
    const removed = await tx
      .delete(schoolLogos)
      .where(eq(schoolLogos.tenantId, ctx.tenantId))
      .returning({ tenantId: schoolLogos.tenantId });
    if (!removed.length) return;
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "school.logo_removed",
        entityType: "school",
        entityId: ctx.tenantId,
      },
      tx,
    );
  });
}

/** When the logo last changed (for cache-busting), or null when there is none. */
export async function getSchoolLogoVersion(ctx: TenantContext): Promise<number | null> {
  const [row] = await getDb()
    .select({ updatedAt: schoolLogos.updatedAt })
    .from(schoolLogos)
    .where(eq(schoolLogos.tenantId, ctx.tenantId));
  return row ? row.updatedAt.getTime() : null;
}

/** The logo bytes of the actor's own school. Any member of the school may read it. */
export async function getSchoolLogo(
  ctx: TenantContext,
): Promise<{ contentType: string; data: Buffer; updatedAt: Date } | null> {
  const [row] = await getDb()
    .select({
      contentType: schoolLogos.contentType,
      data: schoolLogos.data,
      updatedAt: schoolLogos.updatedAt,
    })
    .from(schoolLogos)
    .where(eq(schoolLogos.tenantId, ctx.tenantId));
  return row ?? null;
}
