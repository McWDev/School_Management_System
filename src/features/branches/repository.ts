import "server-only";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { branches, type Branch } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { ConflictError, InvalidStateError, isUniqueViolation, NotFoundError } from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import {
  assertAllBranches,
  assertBranchInScope,
  assertPermission,
  branchFilter,
  tenantFilter,
  type TenantContext,
} from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import { branchInputSchema, branchListFilterSchema } from "./schemas";

/*
 * Branches of the current school. Every query is filtered by ctx.tenantId and,
 * for branch-scoped actors, by their branch scope; records outside the scope
 * behave as not found. Each function checks its branches.* permission, and
 * changes are audited in the same transaction.
 */

const duplicateCode = () =>
  new ConflictError("A branch with this code already exists.", {
    branchCode: ["A branch with this code already exists."],
  });

export async function listBranches(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<Branch>> {
  assertPermission(ctx, "branches.read");
  const { status, search } = branchListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);

  const conditions: (SQL | undefined)[] = [
    tenantFilter(ctx, branches.tenantId),
    branchFilter(ctx, branches.id),
    status ? eq(branches.status, status) : undefined,
  ];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(or(ilike(branches.name, pattern), ilike(branches.branchCode, pattern)));
  }
  const where = and(...conditions);

  const db = getDb();
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(branches)
      .where(where)
      .orderBy(asc(branches.name), branches.id)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(branches).where(where),
  ]);
  return toPage(items, total, pageInput);
}

/**
 * Active branches in the actor's scope, for pickers in other modules (no
 * branches.read needed: it reveals only names of branches the actor works in).
 */
export async function listBranchOptions(
  ctx: TenantContext,
): Promise<Pick<Branch, "id" | "name" | "branchCode">[]> {
  return getDb()
    .select({ id: branches.id, name: branches.name, branchCode: branches.branchCode })
    .from(branches)
    .where(
      and(
        tenantFilter(ctx, branches.tenantId),
        branchFilter(ctx, branches.id),
        eq(branches.status, "active"),
      ),
    )
    .orderBy(asc(branches.name));
}

/** Tenant + scope lookup without a permission check (internal building block). */
async function findBranchInScope(ctx: TenantContext, branchId: string): Promise<Branch> {
  const id = uuidSchema.safeParse(branchId);
  if (!id.success) throw new NotFoundError();
  const [branch] = await getDb()
    .select()
    .from(branches)
    .where(and(tenantFilter(ctx, branches.tenantId), eq(branches.id, id.data)));
  if (!branch) throw new NotFoundError();
  assertBranchInScope(ctx, branch.id);
  return branch;
}

/** A branch of the current school within the actor's scope, or NotFound. */
export async function getBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  assertPermission(ctx, "branches.read");
  return findBranchInScope(ctx, branchId);
}

/**
 * Validate a branch id supplied by the client for a new operation in another
 * module (e.g. creating a class): it must belong to this school, be in the
 * actor's scope and be active. The calling module checks its own permission.
 */
export async function requireActiveBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  const branch = await findBranchInScope(ctx, branchId);
  if (branch.status !== "active") {
    throw new InvalidStateError("This branch is archived and cannot be used for new records.");
  }
  return branch;
}

export async function createBranch(ctx: TenantContext, input: unknown): Promise<Branch> {
  assertPermission(ctx, "branches.create");
  assertAllBranches(ctx);
  const data = parseInput(branchInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [branch] = await tx
        .insert(branches)
        .values({ ...data, tenantId: ctx.tenantId })
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "branch.created",
          entityType: "branch",
          entityId: branch.id,
          after: branch,
        },
        tx,
      );
      return branch;
    });
  } catch (error) {
    if (isUniqueViolation(error, "branches_tenant_code_unique")) throw duplicateCode();
    throw error;
  }
}

export async function updateBranch(
  ctx: TenantContext,
  branchId: string,
  input: unknown,
): Promise<Branch> {
  assertPermission(ctx, "branches.update");
  const current = await findBranchInScope(ctx, branchId);
  if (current.status === "archived") {
    throw new InvalidStateError("Archived branches cannot be edited. Restore the branch first.");
  }
  const data = parseInput(branchInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [branch] = await tx
        .update(branches)
        .set(data)
        .where(and(tenantFilter(ctx, branches.tenantId), eq(branches.id, current.id)))
        .returning();
      if (!branch) throw new NotFoundError();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "branch.updated",
          entityType: "branch",
          entityId: branch.id,
          before: current,
          after: branch,
        },
        tx,
      );
      return branch;
    });
  } catch (error) {
    if (isUniqueViolation(error, "branches_tenant_code_unique")) throw duplicateCode();
    throw error;
  }
}

async function setBranchStatus(
  ctx: TenantContext,
  branchId: string,
  from: Branch["status"],
  to: Branch["status"],
): Promise<Branch> {
  assertPermission(ctx, "branches.archive");
  assertAllBranches(ctx);
  const current = await findBranchInScope(ctx, branchId);
  if (current.status !== from) {
    throw new InvalidStateError(`This branch is already ${current.status}.`);
  }
  return getDb().transaction(async (tx) => {
    const [branch] = await tx
      .update(branches)
      .set({ status: to })
      .where(
        and(
          tenantFilter(ctx, branches.tenantId),
          eq(branches.id, current.id),
          eq(branches.status, from),
        ),
      )
      .returning();
    if (!branch) throw new InvalidStateError("The branch changed. Please reload and try again.");
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: to === "archived" ? "branch.archived" : "branch.restored",
        entityType: "branch",
        entityId: branch.id,
        before: { status: from },
        after: { status: to },
      },
      tx,
    );
    return branch;
  });
}

/** Archive instead of delete: history (classes, students, payments) stays intact. */
export function archiveBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  return setBranchStatus(ctx, branchId, "active", "archived");
}

export function restoreBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  return setBranchStatus(ctx, branchId, "archived", "active");
}
