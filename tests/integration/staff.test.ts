// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq, like } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, authRateLimits, staff, users, workTypes } from "@/db/schema";
import * as staffRepo from "@/features/staff/repository";
import { STARTER_WORK_TYPES } from "@/features/staff/work-types";
import * as tenantRepo from "@/features/tenants/repository";
import * as userRepo from "@/features/users/repository";
import * as auth from "@/lib/auth/service";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/** Required staff fields (phone, gender, date of birth, hire date, location). */
const REQUIRED = {
  phone: "+252 61 000 0000",
  gender: "female" as const,
  dateOfBirth: "1990-01-01",
  hireDate: "2020-01-01",
  location: "Test district",
};

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
    // Staff logins need an approved (active) school.
    await tenantRepo.changeSchoolStatus(platform, a.id, { action: "approve" });
    await tenantRepo.changeSchoolStatus(platform, b.id, { action: "approve" });
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
    await getDb()
      .delete(authRateLimits)
      .where(like(authRateLimits.key, `%staff-test-${run}%`));
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
        ...REQUIRED,
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
    await staffRepo.createStaff(adminA, {
      fullName: "Halima Yusuf",
      workTypeId: typesA.Cook,
      ...REQUIRED,
    });
    const cooks = await staffRepo.listStaff(adminA, { workTypeId: typesA.Cook, ...REQUIRED });
    expect(cooks.items.map((s) => s.fullName)).toEqual(["Halima Yusuf"]);
    const search = await staffRepo.listStaff(adminA, { search: "ahmed" });
    expect(search.items.map((s) => s.fullName)).toEqual(["Ahmed Ali"]);
  });

  it("edits a staff member, marks them as left and removes the photo", async () => {
    const [member] = (await staffRepo.listStaff(adminA, { search: "Ahmed" })).items;
    const updated = await staffRepo.updateStaff(
      adminA,
      member.id,
      { fullName: "Ahmed Ali", workTypeId: typesA.Administrator, ...REQUIRED, status: "left" },
      { removePhoto: true },
    );
    expect(updated).toMatchObject({
      status: "left",
      workTypeId: typesA.Administrator,
      ...REQUIRED,
    });
    expect(await staffRepo.getStaffPhoto(adminA, member.id)).toBeNull();
    const left = await staffRepo.listStaff(adminA, { status: "left" });
    expect(left.items.map((s) => s.id)).toEqual([member.id]);
  });

  it("keeps each school's staff and photos separate", async () => {
    const [member] = (await staffRepo.listStaff(adminA)).items;
    expect((await staffRepo.listStaff(adminB)).total).toBe(0);
    await expect(
      staffRepo.updateStaff(adminB, member.id, {
        fullName: "Hijack",
        workTypeId: typesB.Teacher,
        ...REQUIRED,
      }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
    expect(await staffRepo.getStaffPhoto(adminB, member.id)).toBeNull();
  });

  it("refuses a work type from another school", async () => {
    await expect(
      staffRepo.createStaff(adminA, {
        fullName: "Cross School",
        workTypeId: typesB.Teacher,
        ...REQUIRED,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { workTypeId: expect.any(Array) } });
  });

  it("refuses users without staff permissions", async () => {
    await expect(staffRepo.listStaff(teacherA)).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(
      staffRepo.createStaff(teacherA, {
        fullName: "Nope",
        workTypeId: typesA.Teacher,
        ...REQUIRED,
      }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(staffRepo.createWorkType(teacherA, { name: "Nurse" })).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
  });

  it("rejects photos that are not real images", async () => {
    await expect(
      staffRepo.createStaff(
        adminA,
        { fullName: "Bad Photo", workTypeId: typesA.Teacher, ...REQUIRED },
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

  it("refuses staff younger than 15 on the server", async () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 14);
    await expect(
      staffRepo.createStaff(adminA, {
        fullName: "Too Young",
        workTypeId: typesA.Cleaner,
        ...REQUIRED,
        dateOfBirth: d.toISOString().slice(0, 10),
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { dateOfBirth: expect.any(Array) },
    });
  });

  describe("login access and status", () => {
    const meta = { ip: `staff-test-${run}` };
    const username = `ali.${run.toLowerCase()}`;
    const password = "staff login pass 1";
    const base = { fullName: "Ali Login", ...REQUIRED };
    let staffId: string;

    async function signIn(pw = password) {
      return auth.login({ identifier: username, password: pw }, meta);
    }

    it("gives a staff member login access with a username and password", async () => {
      const created = await staffRepo.createStaff(
        adminA,
        { ...base, workTypeId: typesA.Driver, ...REQUIRED },
        null,
        {
          username: username.toUpperCase(),
          password,
        },
      );
      staffId = created.id;
      expect(created.userId).not.toBeNull();
      const [account] = await getDb().select().from(users).where(eq(users.id, created.userId!));
      expect(account).toMatchObject({
        username,
        email: null,
        status: "active",
        tenantId: adminA.tenantId,
      });
      expect(account.passwordHash).not.toContain(password);

      const result = await signIn();
      expect(result.ok).toBe(true);
      const listed = (await staffRepo.listStaff(adminA, { search: "Ali Login" })).items[0];
      expect(listed.username).toBe(username);
    });

    it("Inactive blocks login and signs the staff member out immediately", async () => {
      const session = await signIn();
      if (!session.ok) throw new Error("expected sign-in");
      expect(await auth.validateSessionToken(session.token)).not.toBeNull();

      await staffRepo.updateStaff(adminA, staffId, {
        ...base,
        workTypeId: typesA.Driver,
        ...REQUIRED,
        status: "inactive",
      });
      expect(await auth.validateSessionToken(session.token)).toBeNull();
      expect(await signIn()).toEqual({ ok: false, reason: "account_disabled" });
    });

    it("Active again allows login with the same password; Left blocks it", async () => {
      await staffRepo.updateStaff(adminA, staffId, {
        ...base,
        workTypeId: typesA.Driver,
        ...REQUIRED,
        status: "active",
      });
      expect((await signIn()).ok).toBe(true);
      await staffRepo.updateStaff(adminA, staffId, {
        ...base,
        workTypeId: typesA.Driver,
        ...REQUIRED,
        status: "left",
      });
      expect(await signIn()).toEqual({ ok: false, reason: "account_disabled" });
      await staffRepo.updateStaff(adminA, staffId, {
        ...base,
        workTypeId: typesA.Driver,
        ...REQUIRED,
        status: "active",
      });
    });

    it("changes the password (signing out old sessions) and keeps it when left empty", async () => {
      const old = await signIn();
      if (!old.ok) throw new Error("expected sign-in");
      const newPassword = "brand new staff pw 2";
      await staffRepo.updateStaff(
        adminA,
        staffId,
        { ...base, workTypeId: typesA.Driver, ...REQUIRED },
        {
          login: { username, password: newPassword },
        },
      );
      expect(await auth.validateSessionToken(old.token)).toBeNull();
      expect((await signIn(newPassword)).ok).toBe(true);

      // Empty password on edit keeps the current one.
      await staffRepo.updateStaff(
        adminA,
        staffId,
        { ...base, workTypeId: typesA.Driver, ...REQUIRED },
        {
          login: { username, password: "" },
        },
      );
      expect((await signIn(newPassword)).ok).toBe(true);
    });

    it("needs a password for a new login and a unique username", async () => {
      await expect(
        staffRepo.createStaff(
          adminA,
          { fullName: "No Pw", workTypeId: typesA.Cook, ...REQUIRED },
          null,
          {
            username: `nopw.${run.toLowerCase()}`,
          },
        ),
      ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { password: expect.any(Array) } });
      await expect(
        staffRepo.createStaff(
          adminB,
          { fullName: "Same Name", workTypeId: typesB.Cook, ...REQUIRED },
          null,
          {
            username,
            password: "another pass 123",
          },
        ),
      ).rejects.toBeInstanceOf(errors.ConflictError);
    });

    it("cannot re-enable a staff login from the Users page", async () => {
      const [member] = await getDb().select().from(staff).where(eq(staff.id, staffId));
      await expect(
        userRepo.setSchoolUserStatus(adminA, member.userId!, "disabled"),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);
    });

    it("deleting the staff member removes the record, photo and login", async () => {
      const [member] = await getDb().select().from(staff).where(eq(staff.id, staffId));
      await staffRepo.updateStaff(
        adminA,
        staffId,
        { ...base, workTypeId: typesA.Driver, ...REQUIRED },
        {
          photo: png,
        },
      );
      const session = await signIn("brand new staff pw 2");
      if (!session.ok) throw new Error("expected sign-in");

      // Another school and users without staff.manage cannot delete.
      await expect(staffRepo.deleteStaff(adminB, staffId)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
      await expect(staffRepo.deleteStaff(teacherA, staffId)).rejects.toBeInstanceOf(
        errors.ForbiddenError,
      );

      await staffRepo.deleteStaff(adminA, staffId);
      expect(await getDb().select().from(staff).where(eq(staff.id, staffId))).toEqual([]);
      expect(await staffRepo.getStaffPhoto(adminA, staffId)).toBeNull();
      expect(await getDb().select().from(users).where(eq(users.id, member.userId!))).toEqual([]);
      expect(await auth.validateSessionToken(session.token)).toBeNull();
      expect(await signIn("brand new staff pw 2")).toEqual({
        ok: false,
        reason: "invalid_credentials",
      });

      const [entry] = await getDb()
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, staffId), eq(auditLogs.action, "staff.deleted")));
      expect(entry.beforeData).toMatchObject({ fullName: "Ali Login", hadLogin: true });
      await expect(staffRepo.deleteStaff(adminA, staffId)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
    });
  });
});
