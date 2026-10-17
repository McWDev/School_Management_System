import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Used for session and reset tokens. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Keyed hash stored in the database instead of the raw token. A database
 * leak alone therefore yields nothing usable. `purpose` separates domains so a
 * session token hash can never match a reset token hash.
 */
export function hashToken(token: string, secret: string, purpose: "session" | "reset"): string {
  return createHmac("sha256", secret).update(`${purpose}:${token}`).digest("hex");
}

/** Keyed hash of an email for rate-limit keys, so raw emails are never stored there. */
export function hashIdentifier(value: string, secret: string): string {
  return createHmac("sha256", secret).update(`id:${value}`).digest("hex").slice(0, 32);
}
