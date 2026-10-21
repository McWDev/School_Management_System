import { connection } from "next/server";
import { findPortalStudent } from "@/features/portal/repository";
import { getStudentPhoto } from "@/features/students/repository";
import { getAccess } from "@/lib/authz";
import { createTenantContext } from "@/lib/tenant-context";

/**
 * GET /api/student-photo/:id — a student's photo. Private: users of the same
 * school with students.read receive it, and a Students Portal user receives
 * their own photo only; everyone else gets 404.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/student-photo/[id]">) {
  await connection();
  const access = await getAccess();
  const { id } = await params;
  let ctx = access?.tenant?.permissions.has("students.read") ? access.tenant : null;
  if (!ctx && access?.tenant) {
    const own = await findPortalStudent(access.user);
    // Read-only, for the student's own photo only.
    if (own && own.id === id) {
      ctx = createTenantContext({
        tenantId: own.tenantId,
        branchScope: "all",
        permissions: ["students.read"],
        actorUserId: access.user.id,
      });
    }
  }
  if (!ctx) return new Response("Not found", { status: 404 });
  const photo = await getStudentPhoto(ctx, id);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.data.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
