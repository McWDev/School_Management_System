/*
 * Development seed: synthetic data only (03-Architecture.md §5).
 * Run with `npm run db:seed`. Safe to re-run: existing records are skipped.
 * Refuses to run against production.
 */
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { tenants } from "@/db/schema";
import { createBranch } from "@/features/branches/repository";
import { changeSchoolStatus, registerSchool } from "@/features/tenants/repository";
import { createPlatformContext, createTenantContext } from "@/lib/tenant-context";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Use the process environment.
}

if (process.env.NEON_BRANCH === "production" || process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: this looks like production.");
  process.exit(1);
}

const platform = createPlatformContext();

async function seedSchool(
  school: { schoolCode: string; name: string; approve: boolean },
  branchList: { branchCode: string; name: string }[],
) {
  const [existing] = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.schoolCode, school.schoolCode));
  if (existing) {
    console.log(`= ${school.schoolCode} already exists, skipping`);
    return;
  }

  const created = await registerSchool(platform, {
    schoolCode: school.schoolCode,
    name: school.name,
    contactEmail: `office@${school.schoolCode.toLowerCase()}.example`,
    currencyCode: "USD",
    timezone: "Africa/Mogadishu",
  });
  if (school.approve) await changeSchoolStatus(platform, created.id, { action: "approve" });

  const ctx = createTenantContext({ tenantId: created.id, branchScope: "all" });
  for (const branch of branchList) await createBranch(ctx, branch);
  console.log(
    `+ ${school.schoolCode} (${school.approve ? "active" : "pending"}), ${branchList.length} branch(es)`,
  );
}

async function main() {
  await seedSchool({ schoolCode: "DEMO-HODAN", name: "Hodan Demo School", approve: true }, [
    { branchCode: "MAIN", name: "Main Campus" },
    { branchCode: "NORTH", name: "North Campus" },
  ]);
  await seedSchool({ schoolCode: "DEMO-WARTA", name: "Warta Demo Academy", approve: false }, [
    { branchCode: "MAIN", name: "Main Campus" },
  ]);
}

main()
  .then(() => console.log("Seed complete."))
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
