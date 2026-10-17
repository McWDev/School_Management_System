// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, permissions, roles, sessions, userRoles, users } from "@/db/schema";
import * as branchRepo from "@/features/branches/repository";
import * as roleRepo from "@/features/roles/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as userRepo from "@/features/users/repository";
import * as auth from "@/lib/auth/service";
import { loadAccessForUser, type Access } from "@/lib/authz/load";
import * as errors from "@/lib/errors";
import { ALL_PERMISSIONS, PERMISSIONS, TENANT_PERMISSIONS } from "@/lib/permissions/catalog";
import { SCHOOL_PRESETS } from "@/lib/permissions/presets";
import { createPlatformContext } from "@/lib/tenant-context";

/*
 * Task 06: permissions, role presets, branch access and audit logging,
 * exercised with real users whose access is loaded from the database exactly
 * as the app does for a signed-in request.
 */
describe.skipIf(!hasDatabase)("authorization", () => {
  const run = uniqueSuffix();
  const password = "authz-test-pass 42";
  const system = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  const platformUserIds: string[] = [];
  const emailOf = (name: string) => `${name}.${run.toLowerCase()}@authz-test.example`;

  let schoolA: string;
  let schoolB: string;
  let mainA: string;
  let northA: string;
  let mainB: string;
  let roleIdA: Record<string, string>;
  let roleIdB: Record<string, string>;
  let adminA: Access;
  let adminB: Access;

  /** Real user → real access, like a signed-in request. */
  async function accessFor(userId: string): Promise<Access> {
    const [user] = await getDb().select().from(users).where(eq(users.id, userId));
    return loadAccessForUser({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      sessionId: "test",
    });
  }

  async function presetRoleIds(tenantId: string) {
    const rows = await getDb()
      .select({ id: roles.id, key: roles.presetKey })
      .from(roles)
      .where(eq(roles.tenantId, tenantId));
    return Object.fromEntries(rows.map((r) => [r.key, r.id])) as Record<string, string>;
  }

  async function makeAdmin(tenantId: string, name: string, schoolAdminRoleId: string) {
    const user = await auth.createUser({
      email: emailOf(name),
      fullName: `Admin ${name}`,
      password,
      tenantId,
    });
    await getDb().update(users).set({ allBranches: true }).where(eq(users.id, user.id));
    await getDb().insert(userRoles).values({ userId: user.id, roleId: schoolAdminRoleId });
    return accessFor(user.id);
  }

  /** Create a school user through the real user-management flow. */
  async function makeUser(
    name: string,
    role: string,
    branchScope: "all" | string[],
    by: Access = adminA,
    roleIds: Record<string, string> = roleIdA,
  ) {
    const { user } = await userRepo.createSchoolUser(by.tenant!, {
      email: emailOf(name),
      fullName: `User ${name}`,
      roleIds: [roleIds[role]],
      allBranches: branchScope === "all",
      branchIds: branchScope === "all" ? [] : branchScope,
    });
    return user;
  }

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `AZ-${run}-${code}`,
      name: `Authz ${code} ${run}`,
      currencyCode: "USD",
      timezone: "UTC",
    });
    const a = await tenantRepo.registerSchool(system, school("A"));
    const b = await tenantRepo.registerSchool(system, school("B"));
    tenantIds.push(a.id, b.id);
    schoolA = a.id;
    schoolB = b.id;
    await tenantRepo.changeSchoolStatus(system, a.id, { action: "approve" });
    await tenantRepo.changeSchoolStatus(system, b.id, { action: "approve" });

    roleIdA = await presetRoleIds(schoolA);
    roleIdB = await presetRoleIds(schoolB);
    adminA = await makeAdmin(schoolA, "admina", roleIdA.school_admin);
    adminB = await makeAdmin(schoolB, "adminb", roleIdB.school_admin);

    mainA = (await branchRepo.createBranch(adminA.tenant!, { branchCode: "MAIN", name: "A Main" }))
      .id;
    northA = (
      await branchRepo.createBranch(adminA.tenant!, { branchCode: "NORTH", name: "A North" })
    ).id;
    mainB = (await branchRepo.createBranch(adminB.tenant!, { branchCode: "MAIN", name: "B Main" }))
      .id;
  });

  afterAll(async () => {
    await deleteTestData(tenantIds, platformUserIds);
    await getPool().end();
  });

  describe("catalog and presets", () => {
    it("has the permission table in sync with the code catalog", async () => {
      const rows = await getDb().select().from(permissions);
      expect(rows.map((r) => r.key).sort()).toEqual([...ALL_PERMISSIONS].sort());
      for (const row of rows)
        expect(row.scope).toBe(PERMISSIONS[row.key as keyof typeof PERMISSIONS].scope);
    });

    it("gives every new school the preset roles", () => {
      expect(Object.keys(roleIdA).sort()).toEqual(SCHOOL_PRESETS.map((p) => p.key).sort());
    });

    it("loads a School Admin with every school permission and all branches", () => {
      expect([...adminA.permissions].sort()).toEqual([...TENANT_PERMISSIONS].sort());
      expect(adminA.tenant?.branchScope.kind).toBe("all");
      expect(adminA.platform).toBeNull();
    });

    it("loads a platform user with platform permissions only", async () => {
      const user = await auth.createUser({
        email: emailOf("plat"),
        fullName: "Plat",
        password,
        tenantId: null,
      });
      platformUserIds.push(user.id);
      const [platformRole] = await getDb()
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.presetKey, "platform_super_admin"));
      await getDb().insert(userRoles).values({ userId: user.id, roleId: platformRole.id });
      const access = await accessFor(user.id);
      expect(access.tenant).toBeNull();
      expect(access.platform?.permissions.has("schools.suspend")).toBe(true);
      expect(access.permissions.has("students.read")).toBe(false);
    });

    it("ignores a role that belongs to another school", async () => {
      const user = await makeUser("crossrole", "teacher", [mainA]);
      // Simulate a bad assignment directly in the database.
      await getDb().insert(userRoles).values({ userId: user.id, roleId: roleIdB.school_admin });
      const access = await accessFor(user.id);
      expect(access.permissions.has("users.manage")).toBe(false);
      expect(access.permissions.has("attendance.take")).toBe(true);
    });
  });

  describe("permission enforcement", () => {
    it("lets a teacher do only teacher things", async () => {
      const teacher = await accessFor((await makeUser("teach", "teacher", [mainA])).id);
      const ctx = teacher.tenant!;
      expect(ctx.permissions.has("attendance.take")).toBe(true);
      await expect(branchRepo.listBranches(ctx)).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(
        branchRepo.createBranch(ctx, { branchCode: "X1", name: "X" }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(userRepo.listSchoolUsers(ctx)).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(roleRepo.listRoles(ctx)).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(tenantRepo.updateSchoolProfile(ctx, {})).rejects.toBeInstanceOf(
        errors.ForbiddenError,
      );
      // Pickers still show only the teacher's own branch.
      expect((await branchRepo.listBranchOptions(ctx)).map((b) => b.id)).toEqual([mainA]);
    });

    it("keeps a branch admin inside their branch", async () => {
      const north = await accessFor((await makeUser("northadm", "branch_admin", [northA])).id);
      const ctx = north.tenant!;
      expect((await branchRepo.listBranches(ctx)).items.map((b) => b.id)).toEqual([northA]);
      await expect(
        branchRepo.updateBranch(ctx, mainA, { branchCode: "MAIN", name: "Hijacked" }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
      await expect(
        branchRepo.createBranch(ctx, { branchCode: "SOUTH", name: "South" }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(userRepo.listSchoolUsers(ctx)).rejects.toBeInstanceOf(errors.ForbiddenError);
      const updated = await branchRepo.updateBranch(ctx, northA, {
        branchCode: "NORTH",
        name: "A North Campus",
      });
      expect(updated.name).toBe("A North Campus");
    });

    it("requires the matching platform permission for each status action", async () => {
      const readOnly = createPlatformContext({ permissions: ["schools.read"] });
      await expect(
        tenantRepo.changeSchoolStatus(readOnly, schoolA, { action: "suspend", reason: "x" }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(
        tenantRepo.registerSchool(readOnly, {
          schoolCode: `AZ-${run}-Z`,
          name: "Z",
          currencyCode: "USD",
          timezone: "UTC",
        }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
    });
  });

  describe("user management", () => {
    it("creates a user with a one-time setup link that sets the first password", async () => {
      const { user, setup } = await userRepo.createSchoolUser(adminA.tenant!, {
        email: emailOf("fresh"),
        fullName: "Fresh User",
        roleIds: [roleIdA.registrar],
        allBranches: true,
        branchIds: [],
      });
      expect(
        await auth.login({ email: emailOf("fresh"), password }, { ip: `t-${run}` }),
      ).toMatchObject({
        reason: "invalid_credentials",
      });
      expect(
        await auth.resetPassword(
          { token: setup.token, password: "my first password 1" },
          { ip: `t-${run}` },
        ),
      ).toEqual({ ok: true });
      const login = await auth.login(
        { email: emailOf("fresh"), password: "my first password 1" },
        { ip: `t-${run}` },
      );
      expect(login.ok).toBe(true);
      expect((await accessFor(user.id)).permissions.has("students.create")).toBe(true);
    });

    it("rejects roles and branches from another school", async () => {
      const base = { fullName: "Cross", allBranches: false };
      await expect(
        userRepo.createSchoolUser(adminA.tenant!, {
          ...base,
          email: emailOf("x1"),
          roleIds: [roleIdB.teacher],
          branchIds: [mainA],
        }),
      ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { roleIds: expect.any(Array) } });
      await expect(
        userRepo.createSchoolUser(adminA.tenant!, {
          ...base,
          email: emailOf("x2"),
          roleIds: [roleIdA.teacher],
          branchIds: [mainB],
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { branchIds: expect.any(Array) },
      });
    });

    it("cannot see or change another school's users", async () => {
      const bUser = await makeUser("buser", "teacher", [mainB], adminB, roleIdB);
      await expect(userRepo.getSchoolUser(adminA.tenant!, bUser.id)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
      await expect(
        userRepo.setSchoolUserStatus(adminA.tenant!, bUser.id, "disabled"),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
      const listA = await userRepo.listSchoolUsers(adminA.tenant!, {}, { pageSize: 100 });
      expect(listA.items.some((u) => u.id === bUser.id)).toBe(false);
    });

    it("stops admins locking themselves out", async () => {
      const self = adminA.user.id;
      await expect(
        userRepo.updateSchoolUser(adminA.tenant!, self, {
          fullName: "Admin A",
          roleIds: [roleIdA.teacher],
          allBranches: true,
          branchIds: [],
        }),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);
      await expect(
        userRepo.updateSchoolUser(adminA.tenant!, self, {
          fullName: "Admin A",
          roleIds: [roleIdA.school_admin],
          allBranches: false,
          branchIds: [mainA],
        }),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);
      await expect(
        userRepo.setSchoolUserStatus(adminA.tenant!, self, "disabled"),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);
    });

    it("changes access, disables (revoking sessions) and audits without secrets", async () => {
      const user = await makeUser("worker", "teacher", [mainA]);
      await userRepo.updateSchoolUser(adminA.tenant!, user.id, {
        fullName: "Worker Renamed",
        roleIds: [roleIdA.finance_officer],
        allBranches: false,
        branchIds: [northA],
      });
      const access = await accessFor(user.id);
      expect(access.permissions.has("fees.record_payment")).toBe(true);
      expect(access.permissions.has("attendance.take")).toBe(false);
      expect(access.tenant?.branchScope).toEqual({
        kind: "branches",
        branchIds: new Set([northA]),
      });

      const { setup } = {
        setup: await userRepo.createSchoolUserResetLink(adminA.tenant!, user.id),
      };
      await auth.resetPassword(
        { token: setup.token, password: "worker pass 1234" },
        { ip: `t-${run}` },
      );
      const session = await auth.login(
        { email: emailOf("worker"), password: "worker pass 1234" },
        { ip: `t-${run}` },
      );
      expect(session.ok).toBe(true);

      await userRepo.setSchoolUserStatus(adminA.tenant!, user.id, "disabled");
      const live = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
      expect(live.every((s) => s.revokedAt !== null)).toBe(true);

      const trail = await getDb()
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, schoolA), eq(auditLogs.entityId, user.id)));
      expect(trail.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          "user.created",
          "user.access_changed",
          "user.reset_link_created",
          "user.disabled",
        ]),
      );
      expect(trail.every((a) => a.actorUserId === adminA.user.id)).toBe(true);
      const changed = trail.find((a) => a.action === "user.access_changed")!;
      expect(changed.beforeData).toMatchObject({ roles: ["Teacher"], branches: ["A Main"] });
      expect(changed.afterData).toMatchObject({
        roles: ["Finance Officer"],
        branches: ["A North Campus"],
      });
      expect(JSON.stringify(trail)).not.toMatch(/argon2|token/i);
    });
  });

  describe("roles", () => {
    it("protects locked roles and other schools' roles", async () => {
      await expect(
        roleRepo.updateRole(adminA.tenant!, roleIdA.school_admin, {
          name: "Admin",
          permissions: ["dashboard.read"],
        }),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);
      await expect(
        roleRepo.updateRole(adminA.tenant!, roleIdB.teacher, {
          name: "Teacher",
          permissions: ["dashboard.read"],
        }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
    });

    it("creates and edits custom roles with school permissions only, audited", async () => {
      const role = await roleRepo.createRole(adminA.tenant!, {
        name: "Librarian",
        permissions: ["students.read", "reports.read"],
      });
      await expect(
        roleRepo.createRole(adminA.tenant!, { name: "librarian", permissions: ["students.read"] }),
      ).rejects.toBeInstanceOf(errors.ConflictError);
      await expect(
        roleRepo.createRole(adminA.tenant!, { name: "Sneaky", permissions: ["schools.suspend"] }),
      ).rejects.toBeInstanceOf(errors.ValidationError);

      await roleRepo.updateRole(adminA.tenant!, role.id, {
        name: "Librarian",
        permissions: ["students.read"],
      });
      const listed = (await roleRepo.listRoles(adminA.tenant!)).find((r) => r.id === role.id)!;
      expect(listed.permissions).toEqual(["students.read"]);
      const [entry] = await getDb()
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, role.id), eq(auditLogs.action, "role.permissions_changed")),
        );
      expect(entry.beforeData).toMatchObject({ permissions: ["reports.read", "students.read"] });
      expect(entry.afterData).toMatchObject({ permissions: ["students.read"] });
    });
  });

  describe("audit trail for schools and branches", () => {
    it("records branch changes and school status changes with actor and reason", async () => {
      const temp = await branchRepo.createBranch(adminA.tenant!, {
        branchCode: "TMP",
        name: "Temp",
      });
      await branchRepo.archiveBranch(adminA.tenant!, temp.id);
      const branchTrail = await getDb()
        .select({ action: auditLogs.action, actor: auditLogs.actorUserId })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, temp.id));
      expect(branchTrail.map((a) => a.action).sort()).toEqual([
        "branch.archived",
        "branch.created",
      ]);
      expect(branchTrail.every((a) => a.actor === adminA.user.id)).toBe(true);

      await tenantRepo.changeSchoolStatus(system, schoolB, {
        action: "suspend",
        reason: "Audit check",
      });
      await tenantRepo.changeSchoolStatus(system, schoolB, { action: "reactivate" });
      const schoolTrail = await getDb()
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, schoolB),
            inArray(auditLogs.action, ["school.suspended", "school.reactivated"]),
          ),
        );
      expect(schoolTrail.find((a) => a.action === "school.suspended")).toMatchObject({
        reason: "Audit check",
        beforeData: { status: "active" },
        afterData: { status: "suspended" },
      });
    });
  });

  describe("school profile and logo", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

    it("lets the School Admin set the letterhead, audited", async () => {
      const updated = await tenantRepo.updateSchoolProfile(adminA.tenant!, {
        name: "Authz A School",
        managerName: "Head A",
        motto: "Learn",
        website: "a.example",
        contactEmail: "office@a.example",
      });
      expect(updated).toMatchObject({ managerName: "Head A", website: "https://a.example" });
      const [entry] = await getDb()
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, schoolA), eq(auditLogs.action, "school.profile_updated")),
        );
      expect(entry.afterData).toMatchObject({ managerName: "Head A", motto: "Learn" });
    });

    it("keeps each school's logo private to that school", async () => {
      await tenantRepo.setSchoolLogo(adminA.tenant!, png);
      const own = await tenantRepo.getSchoolLogo(adminA.tenant!);
      expect(own?.contentType).toBe("image/png");
      expect([...own!.data]).toEqual([...png]);
      expect(await tenantRepo.getSchoolLogo(adminB.tenant!)).toBeNull();
      await tenantRepo.removeSchoolLogo(adminA.tenant!);
      expect(await tenantRepo.getSchoolLogo(adminA.tenant!)).toBeNull();
    });

    it("rejects files that are not PNG, JPEG or WebP", async () => {
      await expect(
        tenantRepo.setSchoolLogo(adminA.tenant!, new TextEncoder().encode("<svg onload=x>")),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("refuses users without settings.manage", async () => {
      const teacher = await accessFor((await makeUser("logoteach", "teacher", [mainA])).id);
      await expect(tenantRepo.setSchoolLogo(teacher.tenant!, png)).rejects.toBeInstanceOf(
        errors.ForbiddenError,
      );
      await expect(
        tenantRepo.updateSchoolProfile(teacher.tenant!, { name: "Hacked" }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
    });
  });
});
