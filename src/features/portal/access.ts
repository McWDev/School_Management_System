import "server-only";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/authz";
import { createTenantContext, type TenantContext } from "@/lib/tenant-context";
import { findPortalStudent, type PortalStudent } from "./repository";

/**
 * The signed-in Students Portal student (others go to the dashboard). `ctx`
 * is a narrow, read-only context for the existing results, fees and receipt
 * readers: portal pages pass only this student's own id to them, and check
 * that anything looked up by id (receipts) belongs to the student.
 */
export async function requirePortalStudent(): Promise<{
  student: PortalStudent;
  ctx: TenantContext;
  user: Awaited<ReturnType<typeof requireAccess>>["user"];
}> {
  const access = await requireAccess();
  const student = await findPortalStudent(access.user);
  if (!student) redirect("/dashboard");
  const ctx = createTenantContext({
    tenantId: student.tenantId,
    branchScope: "all",
    permissions: ["exams.read", "fees.read"],
    actorUserId: access.user.id,
  });
  return { student, ctx, user: access.user };
}
