/*
 * Operator tool: create a single-use password reset link for a user, because
 * email delivery is not configured yet. Prints the link to this terminal only
 * (never to application logs). Usage:
 *
 *   npm run auth:reset-link -- someone@example.com
 *
 * Share the link with the user over a trusted channel. It expires in 30 minutes.
 */
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { users } from "@/db/schema";
import { createPasswordResetToken } from "@/lib/auth/service";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Use the process environment.
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run auth:reset-link -- <email>");
    process.exitCode = 1;
    return;
  }
  const [user] = await getDb()
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, email));
  if (!user || user.status !== "active") {
    console.error("No active user with that email.");
    process.exitCode = 1;
    return;
  }
  const { token, expiresAt } = await createPasswordResetToken(user.id);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`Reset link (expires ${expiresAt.toISOString()}):`);
  console.log(`${base}/reset-password?token=${token}`);
}

main()
  .catch((error) => {
    console.error("Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
