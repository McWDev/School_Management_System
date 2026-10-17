import "server-only";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { branches, staff, staffPhotos, tenants, workTypes } from "@/db/schema";
import { assertPermission, type PlatformContext, type TenantContext } from "@/lib/tenant-context";

/*
 * Dashboard figures. Every number comes from the database and is limited to
 * the viewer's school; nothing is estimated or invented.
 */

export type StaffDashboard = {
  status: { active: number; inactive: number; left: number; total: number };
  /** Current staff (Active + Inactive) per work type, largest first. */
  byWorkType: { name: string; count: number }[];
  /** Current staff by gender. */
  gender: { male: number; female: number };
  recent: {
    id: string;
    fullName: string;
    workTypeName: string;
    status: "active" | "inactive" | "left";
    createdAt: Date;
    photoVersion: number | null;
  }[];
  activeBranches: number;
};

export async function getStaffDashboard(ctx: TenantContext): Promise<StaffDashboard> {
  assertPermission(ctx, "staff.read");
  const db = getDb();
  const inSchool = eq(staff.tenantId, ctx.tenantId);
  const current = and(inSchool, ne(staff.status, "left"));

  const [statusRows, typeRows, genderRows, recent, [branchRow]] = await Promise.all([
    db
      .select({ status: staff.status, total: count() })
      .from(staff)
      .where(inSchool)
      .groupBy(staff.status),
    db
      .select({ name: workTypes.name, total: count() })
      .from(staff)
      .innerJoin(
        workTypes,
        and(eq(workTypes.id, staff.workTypeId), eq(workTypes.tenantId, staff.tenantId)),
      )
      .where(current)
      .groupBy(workTypes.name)
      .orderBy(desc(count()), workTypes.name),
    db
      .select({ gender: staff.gender, total: count() })
      .from(staff)
      .where(current)
      .groupBy(staff.gender),
    db
      .select({
        id: staff.id,
        fullName: staff.fullName,
        workTypeName: workTypes.name,
        status: staff.status,
        createdAt: staff.createdAt,
        photoUpdatedAt: staffPhotos.updatedAt,
      })
      .from(staff)
      .innerJoin(
        workTypes,
        and(eq(workTypes.id, staff.workTypeId), eq(workTypes.tenantId, staff.tenantId)),
      )
      .leftJoin(staffPhotos, eq(staffPhotos.staffId, staff.id))
      .where(inSchool)
      .orderBy(desc(staff.createdAt))
      .limit(5),
    db
      .select({ total: count() })
      .from(branches)
      .where(and(eq(branches.tenantId, ctx.tenantId), eq(branches.status, "active"))),
  ]);

  const byStatus = (s: string) => statusRows.find((r) => r.status === s)?.total ?? 0;
  const status = {
    active: byStatus("active"),
    inactive: byStatus("inactive"),
    left: byStatus("left"),
  };
  return {
    status: { ...status, total: status.active + status.inactive + status.left },
    byWorkType: typeRows.map((r) => ({ name: r.name, count: r.total })),
    gender: {
      male: genderRows.find((r) => r.gender === "male")?.total ?? 0,
      female: genderRows.find((r) => r.gender === "female")?.total ?? 0,
    },
    recent: recent.map(({ photoUpdatedAt, ...row }) => ({
      ...row,
      photoVersion: photoUpdatedAt ? photoUpdatedAt.getTime() : null,
    })),
    activeBranches: branchRow?.total ?? 0,
  };
}

/** The signed-in staff member's own record, for staff who log in. */
export async function getOwnStaffRecord(ctx: TenantContext, userId: string) {
  const [row] = await getDb()
    .select({
      fullName: staff.fullName,
      workTypeName: workTypes.name,
      phone: staff.phone,
      hireDate: staff.hireDate,
      location: staff.location,
    })
    .from(staff)
    .innerJoin(
      workTypes,
      and(eq(workTypes.id, staff.workTypeId), eq(workTypes.tenantId, staff.tenantId)),
    )
    .where(and(eq(staff.tenantId, ctx.tenantId), eq(staff.userId, userId)));
  return row ?? null;
}

/** Schools per registration status, for the platform admin. */
export async function getPlatformDashboard(ctx: PlatformContext) {
  assertPermission(ctx, "schools.read");
  const rows = await getDb()
    .select({ status: tenants.status, total: count() })
    .from(tenants)
    .groupBy(tenants.status);
  const by = (s: string) => rows.find((r) => r.status === s)?.total ?? 0;
  return {
    active: by("active"),
    pending: by("pending"),
    suspended: by("suspended"),
    archived: by("archived"),
  };
}
