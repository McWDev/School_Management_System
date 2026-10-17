import { timestamp } from "drizzle-orm/pg-core";

/** created_at / updated_at columns (UTC, timestamptz). */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** SQL pattern for school/branch codes: upper-case letters, digits and hyphens. */
export const CODE_PATTERN_SQL = "^[A-Z0-9][A-Z0-9-]{0,19}$";
