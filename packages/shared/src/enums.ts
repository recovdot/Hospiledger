export const USER_ROLES = ["seller", "buyer", "inspector", "admin"] as const;
export const SELF_SELECTABLE_ROLES = ["seller", "buyer", "inspector"] as const;
export const PHOTO_TYPES = ["front", "side", "back", "nameplate", "damage"] as const;
export const REQUIRED_PHOTO_TYPES = ["front", "side", "back", "nameplate"] as const;
export const INSPECTION_STATUSES = ["processing", "complete", "failed"] as const;
export const DAMAGE_SEVERITIES = ["low", "medium", "high"] as const;
export const DAMAGE_KINDS = [
  "scratch",
  "rust",
  "broken_component",
  "dent",
  "dirty",
  "missing_parts",
] as const;
export const PASSPORT_STATUSES = [
  "draft",
  "submitted",
  "ai_processing",
  "ai_complete",
  "pending_review",
  "approved",
  "published",
  "ai_failed",
] as const;
export const REVIEW_DECISIONS = ["accept", "edit"] as const;
export const CHAIN_STATUSES = ["pending", "confirmed", "failed"] as const;
export const VERIFICATION_RESULTS = ["match", "mismatch", "pending", "not_found", "unreachable"] as const;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];
export type PhotoType = (typeof PHOTO_TYPES)[number];
export type RequiredPhotoType = (typeof REQUIRED_PHOTO_TYPES)[number];
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];
export type DamageSeverity = (typeof DAMAGE_SEVERITIES)[number];
export type DamageKind = (typeof DAMAGE_KINDS)[number];
export type PassportStatus = (typeof PASSPORT_STATUSES)[number];
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export type ChainStatus = (typeof CHAIN_STATUSES)[number];
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];
