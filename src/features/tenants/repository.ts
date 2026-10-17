import "server-only";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { tenants, type Tenant } from "@/db/schema";
import {
  ConflictError,
  InvalidStateError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, type PlatformContext, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import {
  schoolDetailsSchema,
  schoolListFilterSchema,
  schoolRegistrationSchema,
  statusChangeSchema,
} from "./schemas";
import { resolveTenantTransition } from "./status";

/*
 * Schools (tenants). Platform functions take a PlatformContext; a school's own
 * functions take a TenantContext and can only ever touch ctx.tenantId.
 * Permission checks (schools.*, settings.manage) are layered on in Task 06.
 */

function assertPlatform(ctx: PlatformContext) {
  // Guards JS callers and casts; TypeScript already rejects a TenantContext here.
  if (ctx?.kind !== "platform") throw new NotFoundError();
}

function parseId(id: string): string {
  const result = uuidSchema.safeParse(id);
  if (!result.success) throw new NotFoundError();
  return result.data;
}

// ---------------------------------------------------------------- platform

export async function registerSchool(ctx: PlatformContext, input: unknown): Promise<Tenant> {
  assertPlatform(ctx);
  const data = parseInput(schoolRegistrationSchema, input);
  try {
    const [tenant] = await getDb()
      .insert(tenants)
      .values({ ...data, status: "pending" })
      .returning();
    return tenant;
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
  assertPlatform(ctx);
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
  assertPlatform(ctx);
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
  assertPlatform(ctx);
  const id = parseId(schoolId);
  const { action, reason } = parseInput(statusChangeSchema, input);

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
    return updated;
  });
}

// ------------------------------------------------------------ own school

export async function getOwnSchool(ctx: TenantContext): Promise<Tenant> {
  const [tenant] = await getDb().select().from(tenants).where(eq(tenants.id, ctx.tenantId));
  if (!tenant) throw new NotFoundError();
  return tenant;
}

/** Update the school's own details. Status and school code are not editable here. */
export async function updateOwnSchoolDetails(ctx: TenantContext, input: unknown): Promise<Tenant> {
  assertAllBranches(ctx);
  const data = parseInput(schoolDetailsSchema, input);
  const [updated] = await getDb()
    .update(tenants)
    .set(data)
    .where(eq(tenants.id, ctx.tenantId))
    .returning();
  if (!updated) throw new NotFoundError();
  return updated;
}
