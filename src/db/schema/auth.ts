import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./tenants";

export const userStatus = pgEnum("user_status", ["active", "disabled"]);

/**
 * People who sign in. tenant_id is null only for platform-level users
 * (Platform Super Admin). Users sign in with their email or, for staff given
 * login access by the school, a username. Both are unique across the platform
 * and stored lower-case (02-Product-Decisions.md).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    /** Optional for staff who sign in with a username only. */
    email: text("email").unique("users_email_unique"),
    /** Login name set by the school (e.g. for staff without email), lower-case. */
    username: text("username").unique("users_username_unique"),
    fullName: text("full_name").notNull(),
    /** Argon2id PHC string. Never a plaintext or reversible value. */
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull().default("active"),
    /**
     * Branch scope: true = every branch of the school; false = only the
     * branches in user_branch_access. Ignored for platform users.
     */
    allBranches: boolean("all_branches").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("users_tenant_idx").on(table.tenantId),
    // Target for composite foreign keys so links never cross schools.
    unique("users_tenant_id_id_unique").on(table.tenantId, table.id),
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check("users_username_format", sql.raw(`username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'`)),
    // Everyone needs something to sign in with.
    check(
      "users_login_identifier",
      sql`${table.email} is not null or ${table.username} is not null`,
    ),
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
