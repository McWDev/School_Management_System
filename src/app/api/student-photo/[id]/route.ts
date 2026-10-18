import { connection } from "next/server";
import { getStudentPhoto } from "@/features/students/repository";
import { getAccess } from "@/lib/authz";

/**
 * GET /api/student-photo/:id — a student's photo. Private: only users of
 * the same school with students.read receive it; everyone else gets 404.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/student-photo/[id]">) {
  await connection();
  const access = await getAccess();
  if (!access?.tenant?.permissions.has("students.read")) {
    return new Response("Not found", { status: 404 });
  }
  const photo = await getStudentPhoto(access.tenant, (await params).id);
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
