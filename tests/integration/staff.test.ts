// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, staff, workTypes } from "@/db/schema";
import * as staffRepo from "@/features/staff/repository";
import { STARTER_WORK_TYPES } from "@/features/staff/work-types";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/* School Staff: staff records, work types and photos, isolated per school. */
describe.skipIf(!hasDatabase)("school staff", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let teacherA: ReturnType<typeof createTenantContext>;
  let typesA: Record<string, string>;
  let typesB: Record<string, string>;

  async function typeIds(tenantId: string) {
    const rows = await getDb()
      .select({ id: workTypes.id, name: workTypes.name })
      .from(workTypes)
      .where(eq(workTypes.tenantId, tenantId));
    return Object.fromEntries(rows.map((r) => [r.name, r.id]));
  }

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `ST-${run}-${code}`,
      name: `Staff ${code} ${run}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const a = await tenantRepo.registerSchool(platform, school("A"));
    const b = await tenantRepo.registerSchool(platform, school("B"));
    tenantIds.push(a.id, b.id);
    adminA = createTenantContext({ tenantId: a.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: b.id, branchScope: "all", permissions: "all" });
    teacherA = createTenantContext({
      tenantId: a.id,
      branchScope: "all",
      permissions: ["attendance.take", "students.read"],
    });
    typesA = await typeIds(a.id);
    typesB = await typeIds(b.id);
  });

  afterAll(async () => {
    if (tenantIds.length) {
      await getDb().delete(staff).where(inArray(staff.tenantId, tenantIds));
      await getDb().delete(workTypes).where(inArray(workTypes.tenantId, tenantIds));
    }
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("gives every new school the starter work types", () => {
    expect(Object.keys(typesA).sort()).toEqual([...STARTER_WORK_TYPES].sort());
  });

  it("adds a staff member with a photo, and audits it", async () => {
    const created = await staffRepo.createStaff(
      adminA,
      {
        fullName: "Ahmed Ali",
        workTypeId: typesA.Teacher,
        gender: "male",
        dateOfBirth: "1990-04-02",
        phone: "+252 61 111 1111",
        location: "Hodan district",
        hireDate: "2020-09-01",
      },
      png,
    );
    expect(created).toMatchObject({
      fullName: "Ahmed Ali",
      status: "active",
      dateOfBirth: "1990-04-02",
    });
    const photo = await staffRepo.getStaffPhoto(adminA, created.id);
    expect(photo?.contentType).toBe("image/png");

    const page = await staffRepo.listStaff(adminA);
    const row = page.items.find((s) => s.id === created.id)!;
    expect(row.workTypeName).toBe("Teacher");
    expect(row.photoVersion).not.toBeNull();

    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, created.id), eq(auditLogs.action, "staff.created")));
    expect(entry.actorUserId).toBeNull();
    expect(entry.afterData).toMatchObject({ fullName: "Ahmed Ali", photo: true });
  });

  it("filters by work type, status and search", async () => {
    await staffRepo.createStaff(adminA, { fullName: "Halima Yusuf", workTypeId: typesA.Cook });
    const cooks = await staffRepo.listStaff(adminA, { workTypeId: typesA.Cook });
    expect(cooks.items.map((s) => s.fullName)).toEqual(["Halima Yusuf"]);
    const search = await staffRepo.listStaff(adminA, { search: "ahmed" });
    expect(search.items.map((s) => s.fullName)).toEqual(["Ahmed Ali"]);
  });

  it("edits a staff member, marks them as left and removes the photo", async () => {
    const [member] = (await staffRepo.listStaff(adminA, { search: "Ahmed" })).items;
    const updated = await staffRepo.updateStaff(
      adminA,
      member.id,
      { fullName: "Ahmed Ali", workTypeId: typesA.Administrator, status: "left" },
      { removePhoto: true },
    );
    expect(updated).toMatchObject({ status: "left", workTypeId: typesA.Administrator });
    expect(await staffRepo.getStaffPhoto(adminA, member.id)).toBeNull();
    const left = await staffRepo.listStaff(adminA, { status: "left" });
    expect(left.items.map((s) => s.id)).toEqual([member.id]);
  });

  it("keeps each school's staff and photos separate", async () => {
    const [member] = (await staffRepo.listStaff(adminA)).items;
    expect((await staffRepo.listStaff(adminB)).total).toBe(0);
    await expect(
      staffRepo.updateStaff(adminB, member.id, { fullName: "Hijack", workTypeId: typesB.Teacher }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
    expect(await staffRepo.getStaffPhoto(adminB, member.id)).toBeNull();
  });

  it("refuses a work type from another school", async () => {
    await expect(
      staffRepo.createStaff(adminA, { fullName: "Cross School", workTypeId: typesB.Teacher }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { workTypeId: expect.any(Array) } });
  });

  it("refuses users without staff permissions", async () => {
    await expect(staffRepo.listStaff(teacherA)).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(
      staffRepo.createStaff(teacherA, { fullName: "Nope", workTypeId: typesA.Teacher }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(staffRepo.createWorkType(teacherA, { name: "Nurse" })).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
  });

  it("rejects photos that are not real images", async () => {
    await expect(
      staffRepo.createStaff(
        adminA,
        { fullName: "Bad Photo", workTypeId: typesA.Teacher },
        new TextEncoder().encode("<svg onload=x>"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { photo: expect.any(Array) } });
  });

  describe("work types", () => {
    it("adds, renames and blocks duplicates case-insensitively", async () => {
      const nurse = await staffRepo.createWorkType(adminA, { name: "Nurse" });
      await expect(staffRepo.createWorkType(adminA, { name: "nurse" })).rejects.toBeInstanceOf(
        errors.ConflictError,
      );
      await staffRepo.renameWorkType(adminA, nurse.id, { name: "School Nurse" });
      expect((await staffRepo.listWorkTypes(adminA)).find((t) => t.id === nurse.id)?.name).toBe(
        "School Nurse",
      );
      // The same name is fine in another school.
      await staffRepo.createWorkType(adminB, { name: "School Nurse" });
    });

    it("removes unused work types but not ones in use", async () => {
      const unused = await staffRepo.createWorkType(adminA, { name: `Temp ${run}` });
      await staffRepo.deleteWorkType(adminA, unused.id);
      expect((await staffRepo.listWorkTypes(adminA)).some((t) => t.id === unused.id)).toBe(false);

      await expect(staffRepo.deleteWorkType(adminA, typesA.Cook)).rejects.toBeInstanceOf(
        errors.InvalidStateError,
      );
      const cook = (await staffRepo.listWorkTypes(adminA)).find((t) => t.id === typesA.Cook);
      expect(cook?.staffCount).toBe(1);
    });

    it("cannot touch another school's work types", async () => {
      await expect(
        staffRepo.renameWorkType(adminB, typesA.Driver, { name: "Hijacked" }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
      await expect(staffRepo.deleteWorkType(adminB, typesA.Driver)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
    });
  });
});
