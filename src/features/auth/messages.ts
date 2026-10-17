import type { LoginFailure, ResetResult } from "@/lib/auth/service";

/** User-facing login error messages. Generic until the password is known correct. */
export function loginFailureMessage(failure: LoginFailure): string {
  switch (failure.reason) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "rate_limited":
      return `Too many sign-in attempts. Try again in ${minutes(failure.retryAfterSeconds)}.`;
    case "account_disabled":
      return "Your account is disabled. Contact your school administrator.";
    case "school_inactive":
      if (failure.schoolStatus === "pending") {
        return "Your school's registration is awaiting approval. You can sign in once it is approved.";
      }
      if (failure.schoolStatus === "suspended") {
        return "Your school's account is suspended. Contact platform support.";
      }
      return "Your school's account is closed.";
  }
}

export function resetFailureMessage(failure: Extract<ResetResult, { ok: false }>): string {
  if (failure.reason === "rate_limited") {
    return `Too many attempts. Try again in ${minutes(failure.retryAfterSeconds ?? 60)}.`;
  }
  return "This reset link is invalid or has expired. Ask your administrator for a new link.";
}

function minutes(seconds: number): string {
  const value = Math.max(1, Math.ceil(seconds / 60));
  return value === 1 ? "1 minute" : `${value} minutes`;
}

/** Only allow same-site relative paths after login (no open redirects). */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/login") || value.length > 512) return fallback;
  return value;
}
