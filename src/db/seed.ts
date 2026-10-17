/*
 * Development seed: synthetic data only (03-Architecture.md §5).
 * Run with `npm run db:seed`. Safe to re-run: existing records are skipped.
 * Refuses to run against production.
 *
 * Demo users share the password in SEED_USER_PASSWORD (.env.local).
 */
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { tenants, users } from "@/db/schema";
import { createBranch } from "@/features/branches/repository";
import { changeSchoolStatus, registerSchool } from "@/features/tenants/repository";
import { createUser } from "@/lib/auth/service";
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

/** Returns the school id (existing or new). */
async function seedSchool(
  school: { schoolCode: string; name: string; approve: boolean },
  branchList: { branchCode: string; name: string }[],
): Promise<string> {
  const [existing] = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.schoolCode, school.schoolCode));
  if (existing) {
    console.log(`= school ${school.schoolCode} already exists`);
    return existing.id;
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
    `+ school ${school.schoolCode} (${school.approve ? "active" : "pending"}), ${branchList.length} branch(es)`,
  );
  return created.id;
}

async function seedUser(email: string, fullName: string, tenantId: string | null) {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) {
    console.log(`- skipped user ${email}: set SEED_USER_PASSWORD in .env.local`);
    return;
  }
  const [existing] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) {
    console.log(`= user ${email} already exists`);
    return;
  }
  await createUser({ email, fullName, password, tenantId });
  console.log(`+ user ${email}`);
}

async function main() {
  const hodan = await seedSchool(
    { schoolCode: "DEMO-HODAN", name: "Hodan Demo School", approve: true },
    [
      { branchCode: "MAIN", name: "Main Campus" },
      { branchCode: "NORTH", name: "North Campus" },
    ],
  );
  const warta = await seedSchool(
    { schoolCode: "DEMO-WARTA", name: "Warta Demo Academy", approve: false },
    [{ branchCode: "MAIN", name: "Main Campus" }],
  );

  await seedUser("platform.admin@sms.example", "Platform Admin (Demo)", null);
  await seedUser("admin@demo-hodan.example", "Hodan School Admin (Demo)", hodan);
  await seedUser("admin@demo-warta.example", "Warta School Admin (Demo)", warta);
}

main()
  .then(() => console.log("Seed complete."))
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
