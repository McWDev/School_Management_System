import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/*
 * Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations,
 * 1 lane) — the library defaults, pinned here so they cannot drift silently.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine(
    (value) => value.trim().length >= PASSWORD_MIN_LENGTH,
    "Password cannot be mostly spaces.",
  )
  .refine((value) => new Set(value).size >= 4, "Use a less repetitive password.");

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed hash: treat as a failed verification, never as success.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verify against a throwaway hash when the email is unknown, so a failed login
 * takes about as long whether or not the account exists (no user enumeration).
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-constant-time-checks");
  await verifyPassword(await dummyHash, password);
  return false;
}
