import type { PassportStatus } from "./enums";

export const PASSPORT_TRANSITIONS: Record<PassportStatus, readonly PassportStatus[]> = {
  draft: ["submitted"],
  submitted: ["ai_processing"],
  ai_processing: ["ai_complete", "ai_failed"],
  ai_failed: ["ai_processing"],
  ai_complete: ["pending_review"],
  pending_review: ["approved"],
  approved: ["published"],
  published: [],
};

export class IllegalPassportTransitionError extends Error {
  /**
   * @param from status the passport is currently in
   * @param to status the caller attempted to move to
   */
  constructor(from: PassportStatus, to: PassportStatus) {
    super(`Transisi status tidak valid: ${from} → ${to}.`);
    this.name = "IllegalPassportTransitionError";
  }
}

/**
 * Reports whether a passport status transition is allowed.
 *
 * @param from current status
 * @param to target status
 * @returns `true` when the transition is listed in {@link PASSPORT_TRANSITIONS}
 */
export function canTransition(from: PassportStatus, to: PassportStatus): boolean {
  return PASSPORT_TRANSITIONS[from].includes(to);
}

/**
 * Asserts that a passport status transition is allowed.
 *
 * @param from current status
 * @param to target status
 * @throws {IllegalPassportTransitionError} when the transition is not allowed
 */
export function assertTransition(from: PassportStatus, to: PassportStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalPassportTransitionError(from, to);
  }
}
