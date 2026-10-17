import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { users } from "./auth";
import { branches } from "./branches";
import { tenants } from "./tenants";

export const permissionScope = pgEnum("permission_scope", ["platform", "tenant"]);

/**
 * Permission catalog (07-Authentication-Roles-Security.md §3). Rows are added
 * by migrations and must match src/lib/permissions/catalog.ts (a test checks).
 */
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  scope: permissionScope("scope").notNull(),
  description: text("description").notNull(),
});

/**
 * Roles. tenant_id null = platform role. preset_key marks roles created from a
 * built-in preset (e.g. "school_admin"); custom roles have none.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    presetKey: text("preset_key"),
    name: text("name").notNull(),
    description: text("description"),
    /** Locked roles cannot have their permissions edited (prevents admin lock-out). */
    locked: boolean("locked").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    // One role per name per school; one platform role per name.
    uniqueIndex("roles_tenant_name_unique").on(
      sql`coalesce(${table.tenantId}::text, '')`,
      sql`lower(${table.name})`,
    ),
    uniqueIndex("roles_tenant_preset_unique")
      .on(sql`coalesce(${table.tenantId}::text, '')`, table.presetKey)
      .where(sql`${table.presetKey} is not null`),
    index("roles_tenant_idx").on(table.tenantId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })],
);

/** Role assignments. The role must belong to the user's school (or both platform). */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_roles_role_idx").on(table.roleId),
  ],
);

/**
 * Explicit branch access for users without all_branches. Composite foreign
 * keys guarantee the user and the branch belong to the same school.
 */
export const userBranchAccess = pgTable(
  "user_branch_access",
  {
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.branchId] }),
    foreignKey({
      name: "user_branch_access_user_fk",
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_branch_access_branch_fk",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }).onDelete("restrict"),
    index("user_branch_access_branch_idx").on(table.branchId),
  ],
);

/**
 * Append-only audit trail (07-Authentication-Roles-Security.md §6).
 * before/after hold redacted snapshots; secrets are never stored.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null for platform-level events. */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    /** null for system events. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    check("audit_logs_action_format", sql`${table.action} ~ '^[a-z_]+\\.[a-z_]+$'`),
  ],
);

export type Role = typeof roles.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
