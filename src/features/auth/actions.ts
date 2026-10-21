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
  schoolCode?: string;
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

/**
 * Students Portal sign-in: school code + Student ID + 6-digit password. The
 * login's username is "<school code>-<Student ID>" (usernames are platform-wide),
 * so this is the normal sign-in with that username.
 */
export async function studentLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const schoolCode = String(formData.get("schoolCode") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const echo = { email: studentId, schoolCode };
  if (!schoolCode || !studentId || !password) {
    return {
      ...echo,
      error: "Enter your school code, Student ID and password.",
      fieldErrors: {
        ...(schoolCode ? {} : { schoolCode: ["Enter your school code."] }),
        ...(studentId ? {} : { studentId: ["Enter your Student ID."] }),
        ...(password ? {} : { password: ["Enter your password."] }),
      },
    };
  }

  let result;
  try {
    result = await login(
      { identifier: `${schoolCode}-${studentId}`, password },
      { ip: await getClientIp(), userAgent: await getUserAgent() },
    );
  } catch (error) {
    logger.error("auth.login_error", { error });
    return { ...echo, error: "Sign-in is temporarily unavailable. Please try again." };
  }
  if (!result.ok) {
    return {
      ...echo,
      error:
        result.reason === "invalid_credentials"
          ? "The school code, Student ID or password is wrong."
          : loginFailureMessage(result),
    };
  }

  const previous = await readSessionCookie();
  if (previous) await revokeSessionToken(previous, "replaced_by_login");
  await setSessionCookie(result.token, result.expiresAt);
  redirect("/portal");
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
