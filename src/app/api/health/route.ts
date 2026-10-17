import { connection } from "next/server";
import { checkHealth } from "@/lib/health";

/** GET /api/health — 200 when healthy, 503 when a dependency is down. */
export async function GET() {
  // Always run at request time; never prerender a database check at build.
  await connection();
  const report = await checkHealth();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
