import "server-only";
import { and, count, eq, ilike, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { classes, type SchoolClass } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { ConflictError, isUniqueViolation, NotFoundError } from "@/lib/errors";
import { escapeLike, paginationSchema, toOffset, toPage, type Page } from "@/lib/pagination";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation/fields";
import { classInputSchema, classListFilterSchema } from "./schemas";

/*
 * Classes of the current school: a name and the number of seats. Reading
 * needs classes.read; changes need classes.manage and access to all branches.
 * Every query is limited to ctx.tenantId and every change is audited.
 */

function parseId(id: string) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

function assertCanManage(ctx: TenantContext) {
  assertPermission(ctx, "classes.manage");
  assertAllBranches(ctx);
}

const duplicateName = () =>
  new ConflictError("A class with this name already exists.", {
    name: ["A class with this name already exists."],
  });

/** Natural order by name, so "Class 2" comes before "Class 10". */
const naturalName = [
  sql`lower(regexp_replace(${classes.name}, '[0-9].*$', ''))`,
  sql`nullif(substring(${classes.name} from '[0-9]+'), '')::int nulls first`,
  sql`lower(${classes.name})`,
];

export async function listClasses(
  ctx: TenantContext,
  filters: unknown = {},
  pagination: unknown = {},
): Promise<Page<SchoolClass>> {
  assertPermission(ctx, "classes.read");
  const { status, search } = classListFilterSchema.parse(filters);
  const pageInput = paginationSchema.parse(pagination);

  const conditions: (SQL | undefined)[] = [
    eq(classes.tenantId, ctx.tenantId),
    status ? eq(classes.status, status) : undefined,
    search ? ilike(classes.name, `%${escapeLike(search)}%`) : undefined,
  ];
  const where = and(...conditions);
  const db = getDb();
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(classes)
      .where(where)
      .orderBy(...naturalName)
      .limit(pageInput.pageSize)
      .offset(toOffset(pageInput)),
    db.select({ total: count() }).from(classes).where(where),
  ]);
  return toPage(items, total, pageInput);
}

export async function createClass(ctx: TenantContext, input: unknown): Promise<SchoolClass> {
  assertCanManage(ctx);
  const data = parseInput(classInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(classes)
        .values({ ...data, tenantId: ctx.tenantId })
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "class.created",
          entityType: "class",
          entityId: created.id,
          after: created,
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "classes_tenant_name_unique")) throw duplicateName();
    throw error;
  }
}

export async function updateClass(
  ctx: TenantContext,
  classId: string,
  input: unknown,
): Promise<SchoolClass> {
  assertCanManage(ctx);
  const id = parseId(classId);
  const data = parseInput(classInputSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(classes)
        .where(and(eq(classes.tenantId, ctx.tenantId), eq(classes.id, id)))
        .for("update");
      if (!before) throw new NotFoundError();
      const [updated] = await tx
        .update(classes)
        .set(data)
        .where(and(eq(classes.tenantId, ctx.tenantId), eq(classes.id, id)))
        .returning();
      await recordAudit(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "class.updated",
          entityType: "class",
          entityId: id,
          before,
          after: updated,
        },
        tx,
      );
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error, "classes_tenant_name_unique")) throw duplicateName();
    throw error;
  }
}

/** Permanently delete a class (confirmed in the UI). The audit log keeps a copy. */
export async function deleteClass(ctx: TenantContext, classId: string): Promise<void> {
  assertCanManage(ctx);
  const id = parseId(classId);
  await getDb().transaction(async (tx) => {
    const [removed] = await tx
      .delete(classes)
      .where(and(eq(classes.tenantId, ctx.tenantId), eq(classes.id, id)))
      .returning();
    if (!removed) throw new NotFoundError();
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "class.deleted",
        entityType: "class",
        entityId: id,
        before: removed,
      },
      tx,
    );
  });
}
