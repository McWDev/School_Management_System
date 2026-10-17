import "server-only";
import { headers } from "next/headers";

/** Public base URL for links shown to users (APP_URL, else the request host). */
export async function getAppUrl(): Promise<string> {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function resetPasswordUrl(token: string): Promise<string> {
  return `${await getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}
