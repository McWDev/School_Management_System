// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs } from "@/db/schema";
import * as classRepo from "@/features/classes/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/* Classes: name + seats; add, edit, inactivate, delete — isolated per school. */
describe.skipIf(!hasDatabase)("classes", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `CL-${run}-${code}`,
      name: `Classes ${code}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const a = await tenantRepo.registerSchool(platform, school("A"));
    const b = await tenantRepo.registerSchool(platform, school("B"));
    tenantIds.push(a.id, b.id);
    adminA = createTenantContext({ tenantId: a.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: b.id, branchScope: "all", permissions: "all" });
    viewerA = createTenantContext({
      tenantId: a.id,
      branchScope: "all",
      permissions: ["classes.read"],
    });
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("adds classes with seats and lists them in natural name order", async () => {
    for (const [name, seats] of [
      ["Class 10", "30"],
      ["Class 2B", "40"],
      ["Class 2A", "35"],
      ["Class 1", "25"],
    ]) {
      await classRepo.createClass(adminA, { name, seats });
    }
    const page = await classRepo.listClasses(adminA);
    expect(page.items.map((c) => [c.name, c.seats])).toEqual([
      ["Class 1", 25],
      ["Class 2A", 35],
      ["Class 2B", 40],
      ["Class 10", 30],
    ]);
  });

  it("filters by status and search", async () => {
    expect((await classRepo.listClasses(adminA, { search: "2" })).total).toBe(2);
    expect(
      (await classRepo.listClasses(adminA, { search: "class 10" })).items.map((c) => c.name),
    ).toEqual(["Class 10"]);
  });

  it("keeps class names unique per school, ignoring capitals", async () => {
    await expect(
      classRepo.createClass(adminA, { name: "class 1", seats: "20" }),
    ).rejects.toBeInstanceOf(errors.ConflictError);
    // Another school may use the same name.
    await classRepo.createClass(adminB, { name: "Class 1", seats: "20" });
  });

  it("rejects invalid seat numbers, also in the database", async () => {
    await expect(
      classRepo.createClass(adminA, { name: "Too Big", seats: "999" }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { seats: expect.any(Array) } });
    await expect(
      getDb().execute(
        sql`insert into classes (tenant_id, name, seats) values (${adminA.tenantId}, 'Raw', 0)`,
      ),
    ).rejects.toThrow();
  });

  it("edits a class (name, seats) and marks it Inactive, audited", async () => {
    const [target] = (await classRepo.listClasses(adminA, { search: "Class 2B" })).items;
    const updated = await classRepo.updateClass(adminA, target.id, {
      name: "Class 2C",
      seats: "45",
      status: "inactive",
    });
    expect(updated).toMatchObject({ name: "Class 2C", seats: 45, status: "inactive" });
    expect(
      (await classRepo.listClasses(adminA, { status: "inactive" })).items.map((c) => c.id),
    ).toEqual([target.id]);
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "class.updated")));
    expect(entry.beforeData).toMatchObject({ name: "Class 2B", seats: 40, status: "active" });
  });

  it("deletes a class, audited, and only within the school", async () => {
    const [target] = (await classRepo.listClasses(adminA, { search: "Class 10" })).items;
    await expect(classRepo.deleteClass(adminB, target.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await classRepo.deleteClass(adminA, target.id);
    expect((await classRepo.listClasses(adminA, { search: "Class 10" })).total).toBe(0);
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "class.deleted")));
    expect(entry.beforeData).toMatchObject({ name: "Class 10", seats: 30 });
  });

  it("never shows or changes another school's classes", async () => {
    expect((await classRepo.listClasses(adminB)).items.map((c) => c.name)).toEqual(["Class 1"]);
    const [aClass] = (await classRepo.listClasses(adminA)).items;
    await expect(
      classRepo.updateClass(adminB, aClass.id, { name: "Hijack", seats: "10" }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
  });

  it("lets viewers read but not change classes", async () => {
    expect((await classRepo.listClasses(viewerA)).total).toBeGreaterThan(0);
    await expect(
      classRepo.createClass(viewerA, { name: "New", seats: "10" }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    const [aClass] = (await classRepo.listClasses(adminA)).items;
    await expect(classRepo.deleteClass(viewerA, aClass.id)).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
  });
});
