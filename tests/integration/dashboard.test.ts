// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { workTypes } from "@/db/schema";
import { getStaffDashboard } from "@/features/dashboard/queries";
import * as staffRepo from "@/features/staff/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/* Dashboard figures are real counts, limited to the viewer's school. */
describe.skipIf(!hasDatabase)("dashboard figures", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;

  const person = (
    fullName: string,
    workTypeId: string,
    gender: "male" | "female",
    status = "active",
  ) => ({
    fullName,
    workTypeId,
    gender,
    status,
    phone: "+252 61 000 0000",
    dateOfBirth: "1990-01-01",
    hireDate: "2020-01-01",
    location: "Test district",
  });

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `DB-${run}-${code}`,
      name: `Dash ${code}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const a = await tenantRepo.registerSchool(platform, school("A"));
    const b = await tenantRepo.registerSchool(platform, school("B"));
    tenantIds.push(a.id, b.id);
    adminA = createTenantContext({ tenantId: a.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: b.id, branchScope: "all", permissions: "all" });

    const types = Object.fromEntries(
      (await getDb().select().from(workTypes).where(eq(workTypes.tenantId, a.id))).map((t) => [
        t.name,
        t.id,
      ]),
    );
    // 3 teachers (one inactive), 1 driver, 1 cook who left.
    for (const spec of [
      person("T One", types.Teacher, "female"),
      person("T Two", types.Teacher, "male"),
      person("T Three", types.Teacher, "female"),
      person("D One", types.Driver, "male"),
      person("C Left", types.Cook, "female"),
    ]) {
      await staffRepo.createStaff(adminA, spec);
    }
    const all = await staffRepo.listStaff(adminA);
    const byName = (n: string) => all.items.find((s) => s.fullName === n)!;
    await staffRepo.updateStaff(
      adminA,
      byName("T Three").id,
      person("T Three", types.Teacher, "female", "inactive"),
    );
    await staffRepo.updateStaff(
      adminA,
      byName("C Left").id,
      person("C Left", types.Cook, "female", "left"),
    );
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("counts staff by status", async () => {
    const data = await getStaffDashboard(adminA);
    expect(data.status).toEqual({ active: 3, inactive: 1, left: 1, total: 5 });
  });

  it("groups current staff (not those who left) by work type, largest first", async () => {
    const data = await getStaffDashboard(adminA);
    expect(data.byWorkType).toEqual([
      { name: "Teacher", count: 3 },
      { name: "Driver", count: 1 },
    ]);
  });

  it("splits current staff by gender", async () => {
    expect((await getStaffDashboard(adminA)).gender).toEqual({ male: 2, female: 2 });
  });

  it("lists the five most recent staff, newest first", async () => {
    const recent = (await getStaffDashboard(adminA)).recent;
    expect(recent).toHaveLength(5);
    expect(recent[0].fullName).toBe("C Left");
  });

  it("shows another school nothing of school A", async () => {
    const data = await getStaffDashboard(adminB);
    expect(data.status.total).toBe(0);
    expect(data.recent).toEqual([]);
  });

  it("needs staff.read", async () => {
    const teacher = createTenantContext({
      tenantId: adminA.tenantId,
      branchScope: "all",
      permissions: ["attendance.take"],
    });
    await expect(getStaffDashboard(teacher)).rejects.toBeInstanceOf(errors.ForbiddenError);
  });
});
