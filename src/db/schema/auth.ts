import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./tenants";

export const userStatus = pgEnum("user_status", ["active", "disabled"]);

/**
 * People who sign in. tenant_id is null only for platform-level users
 * (Platform Super Admin). Email is unique across the platform and stored
 * lower-case (02-Product-Decisions.md).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    email: text("email").notNull().unique("users_email_unique"),
    fullName: text("full_name").notNull(),
    /** Argon2id PHC string. Never a plaintext or reversible value. */
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("users_tenant_idx").on(table.tenantId),
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
  ],
);

/**
 * Server-side sessions. Only an HMAC of the random session token is stored;
 * the raw token lives in the HttpOnly cookie.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique("sessions_token_hash_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Updated (throttled) on use; drives the idle timeout. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    /** Absolute expiry, regardless of activity. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    /** Truncated browser user agent, shown to users managing their sessions. */
    userAgent: text("user_agent"),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

/** Single-use, time-limited password reset tokens (stored hashed). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique("password_reset_tokens_token_hash_unique"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

/**
 * Fixed-window counters for abuse protection (login, password reset).
 * Keys never contain raw emails: they use an HMAC of the email.
 */
export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserStatus = (typeof userStatus.enumValues)[number];
