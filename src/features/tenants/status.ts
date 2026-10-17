import type { TenantStatus } from "@/db/schema";

/*
 * School registration status workflow (02-Product-Decisions.md):
 *   pending   → active (approve) | archived (reject)
 *   active    → suspended (suspend)
 *   suspended → active (reactivate) | archived (archive)
 *   archived  → (final)
 */
export type TenantStatusAction = "approve" | "reject" | "suspend" | "reactivate" | "archive";

type Transition = { from: TenantStatus; to: TenantStatus; requiresReason: boolean };

export const tenantStatusTransitions: Record<TenantStatusAction, Transition[]> = {
  approve: [{ from: "pending", to: "active", requiresReason: false }],
  reject: [{ from: "pending", to: "archived", requiresReason: true }],
  suspend: [{ from: "active", to: "suspended", requiresReason: true }],
  reactivate: [{ from: "suspended", to: "active", requiresReason: false }],
  archive: [{ from: "suspended", to: "archived", requiresReason: true }],
};

export type TransitionResult =
  { ok: true; to: TenantStatus } | { ok: false; reason: "not_allowed" | "reason_required" };

/** Decide whether `action` is allowed from `current`, given an optional reason. */
export function resolveTenantTransition(
  current: TenantStatus,
  action: TenantStatusAction,
  reason?: string,
): TransitionResult {
  const transition = tenantStatusTransitions[action].find((t) => t.from === current);
  if (!transition) return { ok: false, reason: "not_allowed" };
  if (transition.requiresReason && !reason?.trim()) return { ok: false, reason: "reason_required" };
  return { ok: true, to: transition.to };
}

/** Only active schools may sign in and operate (enforced when sessions resolve, Task 05). */
export function isTenantOperational(status: TenantStatus): boolean {
  return status === "active";
}
