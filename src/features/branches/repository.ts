import "server-only";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { branches, type Branch } from "@/db/schema";
import { ConflictError, InvalidStateError, isUniqueViolation, NotFoundError } from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import {
  assertAllBranches,
  assertBranchInScope,
  branchFilter,
  tenantFilter,
  type TenantContext,
} from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import { branchInputSchema, branchListFilterSchema } from "./schemas";

/*
 * Branches of the current school. Every query is filtered by ctx.tenantId and,
 * for branch-scoped actors, by their branch scope. Records outside the scope
 * behave as not found. Permission checks (branches.*) are added in Task 06.
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

/** A branch of the current school within the actor's scope, or NotFound. */
export async function getBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
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

/**
 * Validate a branch id supplied by the client for a new operation in another
 * module (e.g. creating a class): it must belong to this school, be in the
 * actor's scope and be active.
 */
export async function requireActiveBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  const branch = await getBranch(ctx, branchId);
  if (branch.status !== "active") {
    throw new InvalidStateError("This branch is archived and cannot be used for new records.");
  }
  return branch;
}

export async function createBranch(ctx: TenantContext, input: unknown): Promise<Branch> {
  assertAllBranches(ctx);
  const data = parseInput(branchInputSchema, input);
  try {
    const [branch] = await getDb()
      .insert(branches)
      .values({ ...data, tenantId: ctx.tenantId })
      .returning();
    return branch;
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
  const current = await getBranch(ctx, branchId);
  if (current.status === "archived") {
    throw new InvalidStateError("Archived branches cannot be edited. Restore the branch first.");
  }
  const data = parseInput(branchInputSchema, input);
  try {
    const [branch] = await getDb()
      .update(branches)
      .set(data)
      .where(and(tenantFilter(ctx, branches.tenantId), eq(branches.id, current.id)))
      .returning();
    if (!branch) throw new NotFoundError();
    return branch;
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
  assertAllBranches(ctx);
  const current = await getBranch(ctx, branchId);
  if (current.status !== from) {
    throw new InvalidStateError(`This branch is already ${current.status}.`);
  }
  const [branch] = await getDb()
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
  return branch;
}

/** Archive instead of delete: history (classes, students, payments) stays intact. */
export function archiveBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  return setBranchStatus(ctx, branchId, "active", "archived");
}

export function restoreBranch(ctx: TenantContext, branchId: string): Promise<Branch> {
  return setBranchStatus(ctx, branchId, "archived", "active");
}
