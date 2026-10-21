// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, eq, like } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, authRateLimits, students, users } from "@/db/schema";
import * as yearRepo from "@/features/academic-years/repository";
import * as classRepo from "@/features/classes/repository";
import * as portalRepo from "@/features/portal/repository";
import * as studentRepo from "@/features/students/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as auth from "@/lib/auth/service";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/*
 * Students Portal: logins for Active students with one-time passwords,
 * resets, turning logins off, status sync, own password changes, and
 * school isolation. Passwords are never stored readable.
 */
describe.skipIf(!hasDatabase)("students portal", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;
  let schoolCode: string;
  const ids: Record<string, string> = {};
  const meta = { ip: `portal-test-${run}` };
  const signIn = (identifier: string, password: string) =>
    auth.login({ identifier, password }, meta);

  const base = (fullName: string) => ({
    fullName,
    gender: "female",
    dateOfBirth: "2012-01-01",
    classId: ids.form1,
    academicYearId: ids.year,
    admissionDate: "2020-01-01",
    guardianName: "Guardian",
    guardianPhone: "+252 61 000 0000",
    feeType: "full_scholarship",
    registrationFee: "0",
  });

  beforeAll(async () => {
    schoolCode = `PT-${run}-A`;
    const a = await tenantRepo.registerSchool(platform, {
      schoolCode,
      name: "Portal A",
      currencyCode: "USD",
      timezone: "UTC",
    });
    const b = await tenantRepo.registerSchool(platform, {
      schoolCode: `PT-${run}-B`,
      name: "Portal B",
      currencyCode: "USD",
      timezone: "UTC",
    });
    tenantIds.push(a.id, b.id);
    // Signing in needs an approved school.
    await tenantRepo.changeSchoolStatus(platform, a.id, { action: "approve" });
    adminA = createTenantContext({ tenantId: a.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: b.id, branchScope: "all", permissions: "all" });
    viewerA = createTenantContext({
      tenantId: a.id,
      branchScope: "all",
      permissions: ["students.read"],
    });
    ids.year = (
      await yearRepo.createAcademicYear(adminA, { name: "2026–2027", status: "current" })
    ).id;
    ids.form1 = (await classRepo.createClass(adminA, { name: "Form 1", seats: "40" })).id;
    ids.amina = (await studentRepo.createStudent(adminA, base("Amina"))).id;
    ids.bashir = (await studentRepo.createStudent(adminA, base("Bashir"))).id;
    const left = await studentRepo.createStudent(adminA, base("Cali"));
    await studentRepo.updateStudent(adminA, left.id, { ...base("Cali"), status: "left" });
    ids.cali = left.id;
  });

  afterAll(async () => {
    await getDb()
      .delete(authRateLimits)
      .where(like(authRateLimits.key, `%portal-test-${run}%`));
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("gives every new student a login with a generated password the school can see", async () => {
    const rows = await portalRepo.listPortalStudents(adminA);
    expect(rows.map((r) => [r.fullName, r.username, r.access])).toEqual([
      ["Amina", `${schoolCode}-stu-0001`.toLowerCase(), "active"],
      ["Bashir", `${schoolCode}-stu-0002`.toLowerCase(), "active"],
      ["Cali", `${schoolCode}-stu-0003`.toLowerCase(), "disabled"], // Cali has left.
    ]);
    const amina = rows[0] as (typeof rows)[number] & { username: string; password: string };
    expect(amina.password).toMatch(/^\d{6}$/);
    // Sign-in uses a hash; the school's copy is encrypted, never readable as stored.
    const [account] = await getDb()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.username, amina.username));
    expect(account.passwordHash).not.toContain(amina.password);
    const [stored] = await getDb()
      .select({ encrypted: students.portalPasswordEncrypted })
      .from(students)
      .where(eq(students.id, ids.amina));
    expect(stored.encrypted).toBeTruthy();
    expect(stored.encrypted).not.toContain(amina.password);
    ids.aminaPassword = amina.password;
    ids.aminaUsername = amina.username;

    const result = await signIn(amina.username, amina.password);
    expect(result.ok).toBe(true);
    const [user] = await getDb().select().from(users).where(eq(users.username, amina.username));
    expect(await portalRepo.findPortalStudent({ ...user, sessionId: "x" })).toMatchObject({
      id: ids.amina,
      fullName: "Amina",
    });
  });

  it("creates missing logins for older students when the page opens", async () => {
    // An older student registered before logins were automatic has none.
    const older = await studentRepo.createStudent(adminA, base("Ebla"));
    const [row] = await getDb()
      .update(students)
      .set({ userId: null, portalPasswordEncrypted: null })
      .where(eq(students.id, older.id))
      .returning({ id: students.id });
    await getDb()
      .delete(users)
      .where(eq(users.username, `${schoolCode}-stu-0004`.toLowerCase()));
    expect((await portalRepo.listPortalStudents(adminA, { access: "none" })).length).toBe(1);

    expect(await portalRepo.ensurePortalLogins(adminA)).toBe(1);
    expect(await portalRepo.ensurePortalLogins(adminA)).toBe(0);
    const [ebla] = await portalRepo.listPortalStudents(adminA, { search: "Ebla" });
    expect(ebla).toMatchObject({ id: row.id, access: "active" });
    expect(ebla.password).toMatch(/^\d{6}$/);
    // The audit log never keeps passwords.
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.tenantId, adminA.tenantId), eq(auditLogs.action, "portal.access_given")),
      );
    expect(JSON.stringify(entry.afterData)).not.toContain(ebla.password!);
    // Students who already have a login get nothing new.
    expect(
      (await portalRepo.givePortalAccess(adminA, { studentIds: [ids.amina] })).created,
    ).toEqual([]);
    await studentRepo.deleteStudent(adminA, older.id);
  });

  it("resets a password: the old one stops working", async () => {
    const reset = await portalRepo.resetPortalPassword(adminA, ids.amina);
    expect(reset.username).toBe(ids.aminaUsername);
    expect((await signIn(reset.username, ids.aminaPassword)).ok).toBe(false);
    expect((await signIn(reset.username, reset.password)).ok).toBe(true);
    const rows = await portalRepo.listPortalStudents(adminA, { search: "Amina" });
    expect(rows[0].password).toBe(reset.password);
    ids.aminaPassword = reset.password;
  });

  it("turns a login off and on, and off when the student stops being Active", async () => {
    await portalRepo.setPortalAccess(adminA, ids.amina, false);
    expect(await signIn(ids.aminaUsername, ids.aminaPassword)).toMatchObject({
      ok: false,
      reason: "account_disabled",
    });
    await portalRepo.setPortalAccess(adminA, ids.amina, true);
    expect((await signIn(ids.aminaUsername, ids.aminaPassword)).ok).toBe(true);

    await studentRepo.updateStudent(adminA, ids.amina, { ...base("Amina"), status: "graduated" });
    expect((await signIn(ids.aminaUsername, ids.aminaPassword)).ok).toBe(false);
    await expect(portalRepo.setPortalAccess(adminA, ids.amina, true)).rejects.toBeInstanceOf(
      errors.InvalidStateError,
    );
  });

  it("lets a signed-in student change their own password", async () => {
    const reset = await portalRepo.resetPortalPassword(adminA, ids.bashir);
    const [user] = await getDb().select().from(users).where(eq(users.username, reset.username));
    const me = { ...user, sessionId: "00000000-0000-4000-8000-000000000000" };
    await expect(
      portalRepo.changeOwnPassword(me, {
        currentPassword: "000000",
        newPassword: "735291",
        confirmPassword: "735291",
      }),
    ).rejects.toMatchObject({
      fieldErrors: { currentPassword: ["The current password is wrong."] },
    });
    await expect(
      portalRepo.changeOwnPassword(me, {
        currentPassword: reset.password,
        newPassword: "735291",
        confirmPassword: "735292",
      }),
    ).rejects.toMatchObject({
      fieldErrors: { confirmPassword: ["The two new passwords are not the same."] },
    });
    await portalRepo.changeOwnPassword(me, {
      currentPassword: reset.password,
      newPassword: "735291",
      confirmPassword: "735291",
    });
    expect((await signIn(reset.username, "735291")).ok).toBe(true);
  });

  it("removes the login with a deleted student", async () => {
    const extra = await studentRepo.createStudent(adminA, base("Dahir"));
    const [row] = await portalRepo.listPortalStudents(adminA, { search: "Dahir" });
    expect(row.username).toBeTruthy();
    await studentRepo.deleteStudent(adminA, extra.id);
    expect(await getDb().select().from(users).where(eq(users.username, row.username!))).toEqual([]);
  });

  it("checks permissions and keeps schools apart", async () => {
    await expect(
      portalRepo.givePortalAccess(viewerA, { studentIds: [ids.bashir] }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    await expect(portalRepo.resetPortalPassword(adminB, ids.bashir)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await expect(
      portalRepo.givePortalAccess(adminB, { studentIds: [ids.bashir] }),
    ).rejects.toBeInstanceOf(errors.NotFoundError);
    expect(await portalRepo.listPortalStudents(adminB)).toEqual([]);
    const [row] = await getDb().select().from(students).where(eq(students.id, ids.bashir));
    expect(row.userId).not.toBeNull();
  });
});
