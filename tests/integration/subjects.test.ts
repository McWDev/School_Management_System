// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { and, desc, eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { auditLogs, workTypes } from "@/db/schema";
import * as staffRepo from "@/features/staff/repository";
import * as subjectRepo from "@/features/subjects/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/* Subjects: name + automatic code; add, edit, inactivate, delete — isolated per school. */
describe.skipIf(!hasDatabase)("subjects", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const tenantIds: string[] = [];
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: ReturnType<typeof createTenantContext>;
  let viewerA: ReturnType<typeof createTenantContext>;

  beforeAll(async () => {
    const school = (code: string) => ({
      schoolCode: `SU-${run}-${code}`,
      name: `Subjects ${code}`,
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
      permissions: ["courses.read"],
    });
  });

  afterAll(async () => {
    await deleteTestData(tenantIds);
    await getPool().end();
  });

  it("gives each subject the next code automatically and lists them by name", async () => {
    await subjectRepo.createSubject(adminA, { name: "Physics", code: "TYPED" });
    await subjectRepo.createSubject(adminA, { name: "english" });
    await subjectRepo.createSubject(adminA, { name: "Mathematics" });
    const { items } = await subjectRepo.listSubjects(adminA);
    expect(items.map((s) => [s.name, s.code, s.status])).toEqual([
      ["english", "SUB-002", "active"],
      ["Mathematics", "SUB-003", "active"],
      ["Physics", "SUB-001", "active"],
    ]);
    expect((await subjectRepo.listSubjects(adminA, { search: "sub-003" })).items[0].name).toBe(
      "Mathematics",
    );
    // Each school numbers its own subjects.
    expect((await subjectRepo.createSubject(adminB, { name: "Mathematics" })).code).toBe("SUB-001");
  });

  it("keeps names unique per school, ignoring capitals", async () => {
    await expect(subjectRepo.createSubject(adminA, { name: "ENGLISH" })).rejects.toMatchObject({
      fieldErrors: { name: ["A subject with this name already exists."] },
    });
  });

  it("edits a subject and marks it Inactive, keeping its code, audited", async () => {
    const [physics] = (await subjectRepo.listSubjects(adminA, { search: "Physics" })).items;
    const updated = await subjectRepo.updateSubject(adminA, physics.id, {
      name: "Physics & Chemistry",
      status: "inactive",
    });
    expect(updated).toMatchObject({
      name: "Physics & Chemistry",
      code: "SUB-001",
      status: "inactive",
    });
    const [entry] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, physics.id), eq(auditLogs.action, "subject.updated")));
    expect(entry.beforeData).toMatchObject({ name: "Physics" });
  });

  it("deletes a subject only within the school and never reuses its code", async () => {
    const art = await subjectRepo.createSubject(adminA, { name: "Art" });
    expect(art.code).toBe("SUB-004");
    await expect(subjectRepo.deleteSubject(adminB, art.id)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await subjectRepo.deleteSubject(adminA, art.id);
    expect((await subjectRepo.listSubjects(adminA, { search: "Art" })).total).toBe(0);
    expect((await subjectRepo.createSubject(adminA, { name: "History" })).code).toBe("SUB-005");
    expect((await subjectRepo.listSubjects(adminB)).items.map((s) => s.name)).toEqual([
      "Mathematics",
    ]);
  });

  it("lets viewers read but not change subjects", async () => {
    expect((await subjectRepo.listSubjects(viewerA)).total).toBe(4);
    await expect(subjectRepo.createSubject(viewerA, { name: "Music" })).rejects.toBeInstanceOf(
      errors.ForbiddenError,
    );
  });

  describe("teacher", () => {
    const staffInput = (fullName: string, workTypeId: string) => ({
      fullName,
      workTypeId,
      gender: "female",
      dateOfBirth: "1990-04-02",
      phone: "+252 61 111 1111",
      location: "Hodan",
      hireDate: "2020-09-01",
    });
    const typeIds = async (tenantId: string) =>
      Object.fromEntries(
        (
          await getDb()
            .select({ id: workTypes.id, name: workTypes.name })
            .from(workTypes)
            .where(eq(workTypes.tenantId, tenantId))
        ).map((t) => [t.name, t.id]),
      );
    const staffIds: Record<string, string> = {};
    let mathId: string;

    beforeAll(async () => {
      const types = await typeIds(adminA.tenantId);
      staffIds.hodan = (
        await staffRepo.createStaff(adminA, staffInput("Hodan Teacher", types.Teacher))
      ).id;
      staffIds.ali = (
        await staffRepo.createStaff(adminA, staffInput("Ali Teacher", types.Teacher))
      ).id;
      staffIds.accountant = (
        await staffRepo.createStaff(adminA, staffInput("Amina Accountant", types.Accountant))
      ).id;
      const inactive = await staffRepo.createStaff(
        adminA,
        staffInput("Idle Teacher", types.Teacher),
      );
      await staffRepo.updateStaff(adminA, inactive.id, {
        ...staffInput("Idle Teacher", types.Teacher),
        status: "inactive",
      });
      staffIds.inactive = inactive.id;
      const typesB = await typeIds(adminB.tenantId);
      staffIds.otherSchool = (
        await staffRepo.createStaff(adminB, staffInput("Other School Teacher", typesB.Teacher))
      ).id;
      [{ id: mathId }] = (await subjectRepo.listSubjects(adminA, { search: "Mathematics" })).items;
    });

    it("lists only Active staff whose work type is Teacher", async () => {
      expect((await subjectRepo.listTeacherOptions(adminA)).map((t) => t.fullName)).toEqual([
        "Ali Teacher",
        "Hodan Teacher",
      ]);
      await expect(subjectRepo.listTeacherOptions(viewerA)).rejects.toBeInstanceOf(
        errors.ForbiddenError,
      );
    });

    it("assigns one teacher, replaces and clears it, audited", async () => {
      await subjectRepo.assignSubjectTeacher(adminA, mathId, { staffId: staffIds.hodan });
      const teacherOf = async () =>
        (await subjectRepo.listSubjects(adminA, { search: "Mathematics" })).items[0].teacherName;
      expect(await teacherOf()).toBe("Hodan Teacher");
      await subjectRepo.assignSubjectTeacher(adminA, mathId, { staffId: staffIds.ali });
      expect(await teacherOf()).toBe("Ali Teacher");
      const [entry] = await getDb()
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, mathId), eq(auditLogs.action, "subject.teacher_assigned")),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);
      expect(entry.afterData).toMatchObject({ teacherName: "Ali Teacher" });
      await subjectRepo.assignSubjectTeacher(adminA, mathId, { staffId: "" });
      expect(await teacherOf()).toBeNull();
    });

    it("refuses staff who are not Active teachers of the school", async () => {
      for (const key of ["accountant", "inactive", "otherSchool"]) {
        await expect(
          subjectRepo.assignSubjectTeacher(adminA, mathId, { staffId: staffIds[key] }),
        ).rejects.toMatchObject({
          fieldErrors: { staffId: ["Choose an Active staff member whose work type is Teacher."] },
        });
      }
      await expect(
        subjectRepo.assignSubjectTeacher(viewerA, mathId, { staffId: staffIds.hodan }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(
        subjectRepo.assignSubjectTeacher(adminB, mathId, { staffId: staffIds.otherSchool }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
    });

    it("leaves the subject without a teacher when that staff member is deleted", async () => {
      await subjectRepo.assignSubjectTeacher(adminA, mathId, { staffId: staffIds.hodan });
      await staffRepo.deleteStaff(adminA, staffIds.hodan);
      const [math] = (await subjectRepo.listSubjects(adminA, { search: "Mathematics" })).items;
      expect(math).toMatchObject({ teacherStaffId: null, teacherName: null });
    });
  });
});
