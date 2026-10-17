import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CODE_PATTERN_SQL, timestamps } from "./_shared";

export const tenantStatus = pgEnum("tenant_status", ["pending", "active", "suspended", "archived"]);

/**
 * A school using the platform (SaaS tenant). Every tenant-owned table carries
 * tenant_id referencing this table. Status is controlled by the platform only.
 * The profile fields form the letterhead on report sheets and letters.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolCode: text("school_code").notNull().unique("tenants_school_code_unique"),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    /** Head of school (principal/manager) named on letters and reports. */
    managerName: text("manager_name"),
    motto: text("motto"),
    website: text("website"),
    /** Official email printed on letters and reports. */
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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * School logo, stored privately in the database (one per school) and served
 * only to signed-in members of the school. Kept out of `tenants` so ordinary
 * school queries never load image bytes.
 */
export const schoolLogos = pgTable(
  "school_logos",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    data: bytea("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "school_logos_content_type",
      sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check("school_logos_size", sql`${table.byteSize} > 0 and ${table.byteSize} <= 1048576`),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantStatus = (typeof tenantStatus.enumValues)[number];
