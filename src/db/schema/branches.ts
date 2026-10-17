import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { CODE_PATTERN_SQL, timestamps } from "./_shared";
import { tenants } from "./tenants";

export const branchStatus = pgEnum("branch_status", ["active", "archived"]);

/** A campus/location of a school. Branches with history are archived, never deleted. */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    branchCode: text("branch_code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    status: branchStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("branches_tenant_code_unique").on(table.tenantId, table.branchCode),
    // Target for composite foreign keys (tenant_id, branch_id) in later tables,
    // so a row can never point at another school's branch.
    unique("branches_tenant_id_id_unique").on(table.tenantId, table.id),
    index("branches_tenant_status_idx").on(table.tenantId, table.status),
    check("branches_branch_code_format", sql.raw(`branch_code ~ '${CODE_PATTERN_SQL}'`)),
  ],
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
export type BranchStatus = (typeof branchStatus.enumValues)[number];
