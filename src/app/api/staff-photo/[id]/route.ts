import { connection } from "next/server";
import { getStaffPhoto } from "@/features/staff/repository";
import { getAccess } from "@/lib/authz";

/**
 * GET /api/staff-photo/:id — a staff member's photo. Private: only users of
 * the same school with staff.read receive it; everyone else gets 404.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/staff-photo/[id]">) {
  await connection();
  const access = await getAccess();
  if (!access?.tenant?.permissions.has("staff.read")) {
    return new Response("Not found", { status: 404 });
  }
  const photo = await getStaffPhoto(access.tenant, (await params).id);
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
