import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthConfig } from "./config";
import { validateSessionToken, type SessionUser } from "./service";

/*
 * Data Access Layer for the session: the only place that reads the session
 * cookie. Pages, layouts and server actions call getCurrentUser()/requireUser();
 * never trust a user id from the client.
 */

export function sessionCookieOptions(expiresAt: Date) {
  const { secureCookies } = getAuthConfig();
  return {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const { cookieName } = getAuthConfig();
  (await cookies()).set(cookieName, token, sessionCookieOptions(expiresAt));
}

export async function readSessionCookie(): Promise<string | undefined> {
  const { cookieName } = getAuthConfig();
  return (await cookies()).get(cookieName)?.value;
}

export async function clearSessionCookie() {
  const { cookieName, secureCookies } = getAuthConfig();
  (await cookies()).set(cookieName, "", {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Session checks compare against the current time and the database, so they
  // always belong to the live request, never to a prerender.
  await connection();
  const token = await readSessionCookie();
  if (!token) return null;
  return validateSessionToken(token);
});

/** The signed-in user, or a redirect to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Client IP for rate limiting (first X-Forwarded-For hop set by the host). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip") || "unknown").slice(0, 64);
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
