// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTestData, hasDatabase, uniqueSuffix } from "./helpers";
import { sql } from "drizzle-orm";
import { getDb, getPool } from "@/db";

import * as branchRepo from "@/features/branches/repository";
import * as tenantRepo from "@/features/tenants/repository";
import * as errors from "@/lib/errors";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

/*
 * Proves tenant and branch isolation for schools and branches
 * (10-Task-Roadmap.md Task 04, 12-Acceptance-Criteria.md "SaaS tenant and
 * branch isolation"). Uses two schools; school A has two branches.
 */
describe.skipIf(!hasDatabase)("tenant and branch isolation", () => {
  const run = uniqueSuffix();
  const platform = createPlatformContext({ permissions: "all" });
  const school = (code: string) => ({
    schoolCode: `T${run}-${code}`,
    name: `Test School ${code} ${run}`,
    currencyCode: "USD",
    timezone: "Africa/Mogadishu",
  });

  const createdTenantIds: string[] = [];
  let schoolA: Awaited<ReturnType<typeof tenantRepo.registerSchool>>;
  let schoolB: typeof schoolA;
  let branchA1: Awaited<ReturnType<typeof branchRepo.createBranch>>;
  let branchA2: typeof branchA1;
  let branchB1: typeof branchA1;
  let adminA: ReturnType<typeof createTenantContext>;
  let adminB: typeof adminA;
  let branchAdminA1: typeof adminA;

  beforeAll(async () => {
    schoolA = await tenantRepo.registerSchool(platform, school("A"));
    schoolB = await tenantRepo.registerSchool(platform, school("B"));
    createdTenantIds.push(schoolA.id, schoolB.id);
    await tenantRepo.changeSchoolStatus(platform, schoolA.id, { action: "approve" });
    await tenantRepo.changeSchoolStatus(platform, schoolB.id, { action: "approve" });

    adminA = createTenantContext({ tenantId: schoolA.id, branchScope: "all", permissions: "all" });
    adminB = createTenantContext({ tenantId: schoolB.id, branchScope: "all", permissions: "all" });

    branchA1 = await branchRepo.createBranch(adminA, { branchCode: "main", name: "A Main" });
    branchA2 = await branchRepo.createBranch(adminA, { branchCode: "north", name: "A North" });
    branchB1 = await branchRepo.createBranch(adminB, { branchCode: "main", name: "B Main" });

    branchAdminA1 = createTenantContext({
      tenantId: schoolA.id,
      branchScope: [branchA1.id],
      permissions: "all",
    });
  });

  afterAll(async () => {
    await deleteTestData(createdTenantIds);
    await getPool().end();
  });

  describe("tenant isolation (school B vs school A)", () => {
    it("cannot read another school's branch", async () => {
      await expect(branchRepo.getBranch(adminB, branchA1.id)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
    });

    it("cannot update another school's branch, and the branch is unchanged", async () => {
      await expect(
        branchRepo.updateBranch(adminB, branchA1.id, { branchCode: "HACK", name: "Hacked" }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
      expect((await branchRepo.getBranch(adminA, branchA1.id)).name).toBe("A Main");
    });

    it("cannot archive another school's branch", async () => {
      await expect(branchRepo.archiveBranch(adminB, branchA1.id)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
      expect((await branchRepo.getBranch(adminA, branchA1.id)).status).toBe("active");
    });

    it("lists only its own branches", async () => {
      const listA = await branchRepo.listBranches(adminA);
      const listB = await branchRepo.listBranches(adminB);
      expect(listA.items.map((b) => b.id).sort()).toEqual([branchA1.id, branchA2.id].sort());
      expect(listA.total).toBe(2);
      expect(listB.items.map((b) => b.id)).toEqual([branchB1.id]);
    });

    it("cannot reach another school's branch by putting it in the branch scope", async () => {
      const forged = createTenantContext({
        tenantId: schoolA.id,
        branchScope: [branchB1.id],
        permissions: "all",
      });
      await expect(branchRepo.getBranch(forged, branchB1.id)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
      expect((await branchRepo.listBranches(forged)).items).toEqual([]);
    });

    it("always creates branches in the actor's own school", async () => {
      const created = await branchRepo.createBranch(adminB, {
        branchCode: "east",
        name: "B East",
        tenantId: schoolA.id,
      });
      expect(created.tenantId).toBe(schoolB.id);
    });

    it("reads and edits only its own school profile, never its status", async () => {
      expect((await tenantRepo.getOwnSchool(adminA)).id).toBe(schoolA.id);
      const updated = await tenantRepo.updateSchoolProfile(adminA, {
        ...school("A"),
        name: `Renamed A ${run}`,
        status: "suspended",
      });
      expect(updated.name).toBe(`Renamed A ${run}`);
      expect(updated.status).toBe("active");
      expect((await tenantRepo.getOwnSchool(adminB)).name).toBe(`Test School B ${run}`);
    });
  });

  describe("branch isolation (branch admin of A1)", () => {
    it("lists only the assigned branch", async () => {
      const list = await branchRepo.listBranches(branchAdminA1);
      expect(list.items.map((b) => b.id)).toEqual([branchA1.id]);
      expect(list.total).toBe(1);
    });

    it("cannot read or update a sibling branch", async () => {
      await expect(branchRepo.getBranch(branchAdminA1, branchA2.id)).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
      await expect(
        branchRepo.updateBranch(branchAdminA1, branchA2.id, { branchCode: "NORTH", name: "X" }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
    });

    it("can read and update its own branch", async () => {
      const updated = await branchRepo.updateBranch(branchAdminA1, branchA1.id, {
        branchCode: "MAIN",
        name: "A Main Campus",
      });
      expect(updated.name).toBe("A Main Campus");
    });

    it("cannot create, archive or restore branches (school-wide operations)", async () => {
      await expect(
        branchRepo.createBranch(branchAdminA1, { branchCode: "SOUTH", name: "South" }),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
      await expect(branchRepo.archiveBranch(branchAdminA1, branchA1.id)).rejects.toBeInstanceOf(
        errors.ForbiddenError,
      );
    });

    it("sees nothing with an empty branch scope", async () => {
      const none = createTenantContext({
        tenantId: schoolA.id,
        branchScope: [],
        permissions: "all",
      });
      expect((await branchRepo.listBranches(none)).total).toBe(0);
    });

    it("cannot update the school profile", async () => {
      await expect(
        tenantRepo.updateSchoolProfile(branchAdminA1, school("A")),
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
    });
  });

  describe("uniqueness", () => {
    it("rejects a duplicate branch code in the same school, case-insensitively", async () => {
      await expect(
        branchRepo.createBranch(adminA, { branchCode: "Main", name: "Duplicate" }),
      ).rejects.toBeInstanceOf(errors.ConflictError);
    });

    it("allows the same branch code in a different school", () => {
      expect(branchA1.branchCode).toBe("MAIN");
      expect(branchB1.branchCode).toBe("MAIN");
    });

    it("rejects a duplicate school code", async () => {
      await expect(tenantRepo.registerSchool(platform, school("a"))).rejects.toBeInstanceOf(
        errors.ConflictError,
      );
    });

    it("enforces the code format in the database itself", async () => {
      await expect(
        getDb().execute(
          sql`insert into branches (tenant_id, branch_code, name) values (${schoolA.id}, 'lower', 'x')`,
        ),
      ).rejects.toThrow();
    });
  });

  describe("archiving", () => {
    it("archives instead of deleting, blocks edits and new use, and restores", async () => {
      const temp = await branchRepo.createBranch(adminA, { branchCode: "TEMP", name: "Temp" });
      const archived = await branchRepo.archiveBranch(adminA, temp.id);
      expect(archived.status).toBe("archived");

      await expect(
        branchRepo.updateBranch(adminA, temp.id, { branchCode: "TEMP", name: "Edited" }),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);
      await expect(branchRepo.requireActiveBranch(adminA, temp.id)).rejects.toBeInstanceOf(
        errors.InvalidStateError,
      );
      await expect(branchRepo.archiveBranch(adminA, temp.id)).rejects.toBeInstanceOf(
        errors.InvalidStateError,
      );

      const archivedList = await branchRepo.listBranches(adminA, { status: "archived" });
      expect(archivedList.items.map((b) => b.id)).toContain(temp.id);

      expect((await branchRepo.restoreBranch(adminA, temp.id)).status).toBe("active");
      expect((await branchRepo.requireActiveBranch(adminA, temp.id)).id).toBe(temp.id);
    });
  });

  describe("school registration status workflow", () => {
    it("starts pending and follows the allowed transitions", async () => {
      const s = await tenantRepo.registerSchool(platform, school("C"));
      createdTenantIds.push(s.id);
      expect(s.status).toBe("pending");

      await expect(
        tenantRepo.changeSchoolStatus(platform, s.id, { action: "suspend", reason: "x" }),
      ).rejects.toBeInstanceOf(errors.InvalidStateError);

      expect(
        (await tenantRepo.changeSchoolStatus(platform, s.id, { action: "approve" })).status,
      ).toBe("active");

      await expect(
        tenantRepo.changeSchoolStatus(platform, s.id, { action: "suspend" }),
      ).rejects.toBeInstanceOf(errors.ValidationError);

      const suspended = await tenantRepo.changeSchoolStatus(platform, s.id, {
        action: "suspend",
        reason: "Subscription overdue",
      });
      expect(suspended.status).toBe("suspended");
      expect(suspended.statusReason).toBe("Subscription overdue");
      expect(suspended.statusChangedAt).toBeInstanceOf(Date);

      expect(
        (await tenantRepo.changeSchoolStatus(platform, s.id, { action: "reactivate" })).status,
      ).toBe("active");
    });

    it("cannot be driven with a tenant context", async () => {
      await expect(
        // @ts-expect-error — status changes require a PlatformContext.
        tenantRepo.changeSchoolStatus(adminA, schoolA.id, { action: "suspend", reason: "x" }),
      ).rejects.toBeInstanceOf(errors.NotFoundError);
      expect((await tenantRepo.getOwnSchool(adminA)).status).toBe("active");
    });

    it("filters and searches schools for the platform", async () => {
      const page = await tenantRepo.listSchools(platform, { search: `T${run}-`, status: "active" });
      expect(page.items.map((s) => s.id)).toEqual(expect.arrayContaining([schoolA.id, schoolB.id]));
      expect(page.items.every((s) => s.status === "active")).toBe(true);
    });
  });

  describe("input handling", () => {
    it("treats malformed ids as not found", async () => {
      await expect(branchRepo.getBranch(adminA, "not-a-uuid")).rejects.toBeInstanceOf(
        errors.NotFoundError,
      );
    });

    it("returns field errors for invalid input", async () => {
      await expect(
        branchRepo.createBranch(adminA, { branchCode: "bad code!", name: "" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });
});
