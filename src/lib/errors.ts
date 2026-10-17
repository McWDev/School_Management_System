/*
 * Application errors with messages that are safe to show users
 * (03-Architecture.md §3, §6). Anything else is reported as a generic error;
 * details go to the server log only.
 */
export type AppErrorCode =
  "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_STATE" | "UNAUTHENTICATED";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Please correct the highlighted fields.",
    fieldErrors?: Record<string, string[]>,
  ) {
    super("VALIDATION", message, fieldErrors);
  }
}

/**
 * Used both for missing records and for records in another tenant/branch, so
 * responses never reveal that another school's record exists.
 */
export class NotFoundError extends AppError {
  constructor(message = "The record was not found.") {
    super("NOT_FOUND", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super("CONFLICT", message, fieldErrors);
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string) {
    super("INVALID_STATE", message);
  }
}

/** Standard result shape for server actions. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: AppErrorCode | "INTERNAL";
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

/** Convert any thrown value into a safe ActionResult error. */
export function toActionError(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
    };
  }
  return {
    ok: false,
    error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
  };
}

/** Postgres unique_violation, unwrapping Drizzle's query error wrapper. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505") {
      return constraint === undefined || candidate.constraint === constraint;
    }
    current = candidate.cause;
  }
  return false;
}
