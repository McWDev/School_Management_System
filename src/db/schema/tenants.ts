import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CODE_PATTERN_SQL, timestamps } from "./_shared";

export const tenantStatus = pgEnum("tenant_status", ["pending", "active", "suspended", "archived"]);

/**
 * A school using the platform (SaaS tenant). Every tenant-owned table carries
 * tenant_id referencing this table. Status is controlled by the platform only.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolCode: text("school_code").notNull().unique("tenants_school_code_unique"),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    logoUrl: text("logo_url"),
    contactEmail: text("contact_email"),
    phone: text("phone"),
    address: text("address"),
    /** ISO 4217 code; one currency per school in the MVP. */
    currencyCode: text("currency_code").notNull(),
    /** IANA time zone, e.g. Africa/Mogadishu. */
    timezone: text("timezone").notNull(),
    status: tenantStatus("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("tenants_status_idx").on(table.status),
    check("tenants_school_code_format", sql.raw(`school_code ~ '${CODE_PATTERN_SQL}'`)),
    check("tenants_currency_code_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantStatus = (typeof tenantStatus.enumValues)[number];
