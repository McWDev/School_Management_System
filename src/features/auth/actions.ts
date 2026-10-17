"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { login, resetPassword, revokeSessionToken } from "@/lib/auth/service";
import {
  clearSessionCookie,
  getClientIp,
  getUserAgent,
  readSessionCookie,
  setSessionCookie,
} from "@/lib/auth/session";
import { loginFailureMessage, resetFailureMessage, safeRedirectPath } from "./messages";

/*
 * Server Actions are POST-only and Next.js checks their Origin against the
 * host, which together with SameSite=Lax cookies protects them from CSRF.
 */

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echo back non-secret input so the form keeps it after an error. */
  email?: string;
  success?: boolean;
};

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Email address or username (staff given login access by their school).
  const email = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email.trim() || !password) {
    return {
      email,
      error: "Enter your email or username and your password.",
      fieldErrors: {
        ...(email.trim() ? {} : { identifier: ["Enter your email or username."] }),
        ...(password ? {} : { password: ["Enter your password."] }),
      },
    };
  }

  let result;
  try {
    result = await login(
      { identifier: email, password },
      { ip: await getClientIp(), userAgent: await getUserAgent() },
    );
  } catch (error) {
    logger.error("auth.login_error", { error });
    return { email, error: "Sign-in is temporarily unavailable. Please try again." };
  }
  if (!result.ok) return { email, error: loginFailureMessage(result) };

  // Rotate: end any session this browser already had (prevents session fixation).
  const previous = await readSessionCookie();
  if (previous) await revokeSessionToken(previous, "replaced_by_login");
  await setSessionCookie(result.token, result.expiresAt);

  redirect(safeRedirectPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionCookie();
  if (token) await revokeSessionToken(token, "logout");
  await clearSessionCookie();
  redirect("/login");
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password !== confirm) {
    return { fieldErrors: { confirmPassword: ["The passwords do not match."] } };
  }
  try {
    const result = await resetPassword({ token, password }, { ip: await getClientIp() });
    if (!result.ok) return { error: resetFailureMessage(result) };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: error.message, fieldErrors: error.fieldErrors };
    }
    logger.error("auth.reset_error", { error });
    return { error: "Password reset is temporarily unavailable. Please try again." };
  }
  // All sessions were revoked; clear this browser's cookie too.
  await clearSessionCookie();
  return { success: true };
}
