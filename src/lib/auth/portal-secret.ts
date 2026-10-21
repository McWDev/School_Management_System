import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getAuthConfig } from "./config";

/*
 * Students Portal passwords (product owner 2026-10-21): the school must be able
 * to see each student's 6-digit portal password. Sign-in still checks the
 * Argon2 hash; this keeps a second, encrypted copy (AES-256-GCM) that only
 * school staff with students.update can read. The key is derived from
 * SESSION_SECRET, so nothing readable is stored and no new secret is needed;
 * if SESSION_SECRET changes, old copies can no longer be read (reset them).
 */

const VERSION = "v1";

function key() {
  return Buffer.from(
    hkdfSync("sha256", getAuthConfig().sessionSecret, "", "students-portal-password", 32),
  );
}

/** Encrypt a portal password, bound to its student (so copies cannot be swapped). */
export function encryptPortalPassword(password: string, studentId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(studentId));
  const data = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [Buffer.from(VERSION), iv, cipher.getAuthTag(), data]
    .map((p) => p.toString("base64"))
    .join(".");
}

/** The readable password, or null when it cannot be read (e.g. the secret changed). */
export function decryptPortalPassword(value: string | null, studentId: string): string | null {
  if (!value) return null;
  try {
    const [version, iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64"));
    if (version.toString() !== VERSION) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(Buffer.from(studentId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
