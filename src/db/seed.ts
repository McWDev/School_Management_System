/*
 * Development seed: synthetic data only (03-Architecture.md §5).
 * Run with `npm run db:seed`. Safe to re-run: existing records are skipped.
 * Refuses to run against production.
 *
 * Demo users share the password in SEED_USER_PASSWORD (.env.local).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { serializeError } from "@/lib/logger";
import { branches, roles, tenants, userBranchAccess, userRoles, users } from "@/db/schema";
import { createBranch } from "@/features/branches/repository";
import { ensureSchoolRoles } from "@/features/roles/presets";
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

const platform = createPlatformContext({ permissions: "all" });

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

  const ctx = createTenantContext({ tenantId: created.id, branchScope: "all", permissions: "all" });
  for (const branch of branchList) await createBranch(ctx, branch);
  console.log(
    `+ school ${school.schoolCode} (${school.approve ? "active" : "pending"}), ${branchList.length} branch(es)`,
  );
  return created.id;
}

type SeedUser = {
  email: string;
  fullName: string;
  tenantId: string | null;
  /** Role preset key, e.g. "school_admin" or "platform_super_admin". */
  role: string;
  /** "all", or branch codes for branch-scoped users. */
  branches?: "all" | string[];
};

/** Create the user if missing, then (re)apply its demo role and branch access. */
async function seedUser(spec: SeedUser) {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) {
    console.log(`- skipped user ${spec.email}: set SEED_USER_PASSWORD in .env.local`);
    return;
  }
  const db = getDb();
  let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, spec.email));
  if (!user) {
    user = await createUser({
      email: spec.email,
      fullName: spec.fullName,
      password,
      tenantId: spec.tenantId,
    });
    console.log(`+ user ${spec.email}`);
  } else {
    console.log(`= user ${spec.email} already exists`);
  }

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        spec.tenantId ? eq(roles.tenantId, spec.tenantId) : isNull(roles.tenantId),
        eq(roles.presetKey, spec.role),
      ),
    );
  if (!role) throw new Error(`Missing role ${spec.role}`);

  const scope = spec.branches ?? "all";
  const branchRows =
    spec.tenantId && scope !== "all"
      ? await db
          .select({ id: branches.id })
          .from(branches)
          .where(and(eq(branches.tenantId, spec.tenantId), inArray(branches.branchCode, scope)))
      : [];

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ allBranches: scope === "all" })
      .where(eq(users.id, user.id));
    await tx.delete(userRoles).where(eq(userRoles.userId, user.id));
    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
    await tx.delete(userBranchAccess).where(eq(userBranchAccess.userId, user.id));
    if (spec.tenantId && branchRows.length) {
      await tx
        .insert(userBranchAccess)
        .values(
          branchRows.map((b) => ({ tenantId: spec.tenantId!, userId: user.id, branchId: b.id })),
        );
    }
  });
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
  // Schools created before roles existed get their preset roles now.
  await ensureSchoolRoles(hodan);
  await ensureSchoolRoles(warta);

  const demoUsers: SeedUser[] = [
    {
      email: "platform.admin@sms.example",
      fullName: "Platform Admin (Demo)",
      tenantId: null,
      role: "platform_super_admin",
    },
    {
      email: "admin@demo-hodan.example",
      fullName: "Hodan School Admin (Demo)",
      tenantId: hodan,
      role: "school_admin",
    },
    {
      email: "north.admin@demo-hodan.example",
      fullName: "North Branch Admin (Demo)",
      tenantId: hodan,
      role: "branch_admin",
      branches: ["NORTH"],
    },
    {
      email: "teacher@demo-hodan.example",
      fullName: "Main Campus Teacher (Demo)",
      tenantId: hodan,
      role: "teacher",
      branches: ["MAIN"],
    },
    {
      email: "finance@demo-hodan.example",
      fullName: "Finance Officer (Demo)",
      tenantId: hodan,
      role: "finance_officer",
    },
    {
      email: "admin@demo-warta.example",
      fullName: "Warta School Admin (Demo)",
      tenantId: warta,
      role: "school_admin",
    },
  ];
  for (const spec of demoUsers) await seedUser(spec);
}

main()
  .then(() => console.log("Seed complete."))
  .catch((error) => {
    console.error("Seed failed:", JSON.stringify(serializeError(error), null, 2));
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
