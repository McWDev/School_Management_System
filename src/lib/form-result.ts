import type { ActionResult } from "./errors";

/** State shape returned by form server actions and consumed with useActionState. */
export type FormResult<T = undefined> =
  | { status: "idle" }
  | { status: "success"; data: T; message?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export const IDLE: FormResult<never> = { status: "idle" };

export function toFormResult<T>(result: ActionResult<T>, message?: string): FormResult<T> {
  return result.ok
    ? { status: "success", data: result.data, message }
    : { status: "error", message: result.error.message, fieldErrors: result.error.fieldErrors };
}

/** Read a FormData field as a trimmed string ("" when missing). */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
