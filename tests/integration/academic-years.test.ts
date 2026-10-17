// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs } from "@/db/schema";
import * as yearRepo from "@/features/academic-years/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/* Academic years: name + Upcoming/Current/Closed, one Current per school. */
describe.skipIf(!hasDatabase)("academic years", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;

  const statuses = async () =>
    Object.fromEntries(
      (await yearRepo.listAcademicYears(adminA)).items.map((y) => [y.name, y.status]),
    );

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `AY-${run}-${code}`,
      name: `Years ${code}`,
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
      permissions: ["academic_years.read"],
    });
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("adds years (Upcoming by default) and lists Current first", async () => {
    expect(await yearRepo.getCurrentAcademicYear(adminA)).toBeNull();
    await yearRepo.createAcademicYear(adminA, { name: "2024–2025", status: "closed" });
    await yearRepo.createAcademicYear(adminA, { name: "2026–2027" });
    await yearRepo.createAcademicYear(adminA, { name: "2025–2026", status: "current" });
    expect((await yearRepo.listAcademicYears(adminA)).items.map((y) => y.name)).toEqual([
      "2025–2026",
      "2026–2027",
      "2024–2025",
    ]);
    expect((await yearRepo.getCurrentAcademicYear(adminA))?.name).toBe("2025–2026");
  });

  it("keeps only one Current year: a new Current year closes the old one, audited", async () => {
    const old = await yearRepo.getCurrentAcademicYear(adminA);
    const [next] = (await yearRepo.listAcademicYears(adminA, { search: "2026–2027" })).items;
    await yearRepo.makeAcademicYearCurrent(adminA, next.id);
    expect(await statuses()).toEqual({
      "2026–2027": "current",
      "2025–2026": "closed",
      "2024–2025": "closed",
    });
    const entries = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, old!.id), eq(auditLogs.action, "academic_year.updated")));
    expect(entries.map((e) => (e.afterData as { status: string }).status)).toContain("closed");

    // Creating a Current year also closes the previous one.
    await yearRepo.createAcademicYear(adminA, { name: "2027–2028", status: "current" });
    expect((await statuses())["2026–2027"]).toBe("closed");
    expect((await yearRepo.listAcademicYears(adminA, { status: "current" })).total).toBe(1);
  });

  it("enforces one Current year in the database too", async () => {
    await expect(
      getDb().execute(
        sql`insert into academic_years (tenant_id, name, status) values (${adminA.tenantId}, 'Raw', 'current')`,
      ),
    ).rejects.toThrow();
  });

  it("keeps names unique per school, ignoring capitals", async () => {
    await yearRepo.createAcademicYear(adminA, { name: "Year X" });
    await expect(yearRepo.createAcademicYear(adminA, { name: "year x" })).rejects.toBeInstanceOf(
      errors.ConflictError,
    );
    await yearRepo.createAcademicYear(adminB, { name: "Year X" });
  });

  it("edits the name and status", async () => {
    const [target] = (await yearRepo.listAcademicYears(adminA, { search: "Year X" })).items;
    const updated = await yearRepo.updateAcademicYear(adminA, target.id, {
      name: "Year Y",
      status: "closed",
    });
    expect(updated).toMatchObject({ name: "Year Y", status: "closed" });
  });

  it("deletes a year, audited, and only within the school", async () => {
    const [target] = (await yearRepo.listAcademicYears(adminA, { search: "Year Y" })).items;
    await expect(yearRepo.deleteAcademicYear(adminB, target.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await yearRepo.deleteAcademicYear(adminA, target.id);
    expect((await yearRepo.listAcademicYears(adminA, { search: "Year Y" })).total).toBe(0);
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "academic_year.deleted")));
    expect(entry.beforeData).toMatchObject({ name: "Year Y" });
  });

  it("never shows or changes another school's years", async () => {
    expect((await yearRepo.listAcademicYears(adminB)).items.map((y) => y.name)).toEqual(["Year X"]);
    expect(await yearRepo.getCurrentAcademicYear(adminB)).toBeNull();
    const current = await yearRepo.getCurrentAcademicYear(adminA);
    await expect(yearRepo.makeAcademicYearCurrent(adminB, current!.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
  });

  it("lets viewers read but not change years", async () => {
    expect((await yearRepo.listAcademicYears(viewerA)).total).toBeGreaterThan(0);
    await expect(yearRepo.createAcademicYear(viewerA, { name: "New" })).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
    const current = await yearRepo.getCurrentAcademicYear(adminA);
    await expect(yearRepo.deleteAcademicYear(viewerA, current!.id)).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
  });
});
