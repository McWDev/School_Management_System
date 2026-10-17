import { connection } from "next/server";
import { getSchoolLogo } from "@/features/tenants/repository";
import { getAccess } from "@/lib/authz";

/**
 * GET /api/school-logo — the signed-in user's own school logo. Private: only
 * members of the school receive it; everyone else gets 404.
 */
export async function GET() {
  await connection();
  const access = await getAccess();
  if (!access?.tenant) return new Response("Not found", { status: 404 });

  const logo = await getSchoolLogo(access.tenant);
  if (!logo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Content-Length": String(logo.data.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Last-Modified": logo.updatedAt.toUTCString(),
    },
  });
}
