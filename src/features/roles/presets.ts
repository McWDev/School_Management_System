import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { rolePermissions, roles } from "@/db/schema";
import { SCHOOL_PRESETS } from "@/lib/permissions/presets";

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Create any missing preset roles for a school (idempotent). Existing roles
 * are left untouched so schools keep their customizations.
 */
export async function ensureSchoolRoles(tenantId: string, executor: Executor = getDb()) {
  const existing = await executor
    .select({ presetKey: roles.presetKey })
    .from(roles)
    .where(
      and(
        eq(roles.tenantId, tenantId),
        inArray(
          roles.presetKey,
          SCHOOL_PRESETS.map((p) => p.key),
        ),
      ),
    );
  const have = new Set(existing.map((r) => r.presetKey));

  for (const preset of SCHOOL_PRESETS) {
    if (have.has(preset.key)) continue;
    const [role] = await executor
      .insert(roles)
      .values({
        tenantId,
        presetKey: preset.key,
        name: preset.name,
        description: preset.description,
        locked: preset.locked ?? false,
      })
      .returning({ id: roles.id });
    await executor
      .insert(rolePermissions)
      .values(preset.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
}
