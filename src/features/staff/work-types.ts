import "server-only";
import { getDb, type Database } from "@/db";
import { workTypes } from "@/db/schema";

/** Work types every new school starts with; schools can add, rename and remove them. */
export const STARTER_WORK_TYPES = [
  "Teacher",
  "Administrator",
  "Accountant",
  "Secretary",
  "Librarian",
  "Security Guard",
  "Cleaner",
  "Driver",
  "Cook",
] as const;

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Add any missing starter work types for a school (idempotent). */
export async function ensureStarterWorkTypes(tenantId: string, executor: Executor = getDb()) {
  await executor
    .insert(workTypes)
    .values(STARTER_WORK_TYPES.map((name) => ({ tenantId, name })))
    .onConflictDoNothing();
}
