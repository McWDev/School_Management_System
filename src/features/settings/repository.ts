import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { schoolSettings, subjectMarks } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import { assertAllBranches, assertPermission, type TenantContext } from "@/lib/tenant-context";
import { parseInput } from "@/lib/validation";
import { DEFAULT_SETTINGS, generalSettingsSchema, type GeneralSettings } from "./schemas";

/*
 * General Settings of the current school: exam rules and number prefixes.
 * Anyone in the school's code paths may read them (they shape marks and new
 * numbers); changing them needs settings.manage and access to all branches.
 */

type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0] | ReturnType<typeof getDb>;

/** The school's settings, or the defaults when it never changed them. */
export async function getSchoolSettings(
  executor: Executor,
  tenantId: string,
): Promise<GeneralSettings> {
  const [row] = await executor
    .select()
    .from(schoolSettings)
    .where(eq(schoolSettings.tenantId, tenantId));
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    passMark: row.passMark,
    midtermMax: row.midtermMax,
    activitiesMax: row.activitiesMax,
    finalMax: row.finalMax,
    studentPrefix: row.studentPrefix,
    receiptPrefix: row.receiptPrefix,
    payslipPrefix: row.payslipPrefix,
  };
}

/** Settings for the General Settings page (needs settings.manage). */
export async function getGeneralSettings(ctx: TenantContext): Promise<GeneralSettings> {
  assertPermission(ctx, "settings.manage");
  return getSchoolSettings(getDb(), ctx.tenantId);
}

/**
 * Save General Settings. A part's maximum cannot drop below a mark already
 * entered for it. New prefixes apply to new numbers only.
 */
export async function updateGeneralSettings(
  ctx: TenantContext,
  input: unknown,
): Promise<GeneralSettings> {
  assertPermission(ctx, "settings.manage");
  assertAllBranches(ctx);
  const data = parseInput(generalSettingsSchema, input);
  return getDb().transaction(async (tx) => {
    const before = await getSchoolSettings(tx, ctx.tenantId);
    const [top] = await tx
      .select({
        midterm: sql<string | null>`max(${subjectMarks.midterm})::text`,
        activities: sql<string | null>`max(${subjectMarks.activities})::text`,
        final: sql<string | null>`max(${subjectMarks.final})::text`,
      })
      .from(subjectMarks)
      .where(and(eq(subjectMarks.tenantId, ctx.tenantId)));
    const fieldErrors: Record<string, string[]> = {};
    for (const [field, highest, label] of [
      ["midtermMax", top?.midterm, "Midterm"],
      ["activitiesMax", top?.activities, "Activities"],
      ["finalMax", top?.final, "Final"],
    ] as const) {
      if (highest !== null && highest !== undefined && Number(highest) > data[field]) {
        fieldErrors[field] = [
          `A ${label} mark of ${Number(highest)} is already entered; the maximum cannot be lower.`,
        ];
      }
    }
    if (Object.keys(fieldErrors).length) throw new ValidationError(undefined, fieldErrors);

    await tx
      .insert(schoolSettings)
      .values({ tenantId: ctx.tenantId, ...data })
      .onConflictDoUpdate({ target: schoolSettings.tenantId, set: data });
    await recordAudit(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "settings.general_updated",
        entityType: "school_settings",
        entityId: ctx.tenantId,
        before,
        after: data,
      },
      tx,
    );
    return data;
  });
}
