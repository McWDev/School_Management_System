import { defineConfig } from "drizzle-kit";
import { withVerifiedSsl } from "./src/db/connection-url";

// Load local secrets for CLI use; deployments provide env vars directly.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI); rely on the process environment.
}

// Migrations must use the direct (non-pooled) connection: PgBouncer's
// transaction mode breaks session-level operations that migrations rely on.
const url = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: url ? withVerifiedSsl(url) : "" },
  strict: true,
  verbose: true,
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
});
