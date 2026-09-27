import {
  CHAIN_STATUSES,
  DAMAGE_SEVERITIES,
  INSPECTION_STATUSES,
  PASSPORT_STATUSES,
  PHOTO_TYPES,
  REVIEW_DECISIONS,
  USER_ROLES,
} from "@hospiledger/shared";
import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", USER_ROLES);
export const photoType = pgEnum("photo_type", PHOTO_TYPES);
export const inspectionStatus = pgEnum("inspection_status", INSPECTION_STATUSES);
export const damageSeverity = pgEnum("damage_severity", DAMAGE_SEVERITIES);
export const passportStatus = pgEnum("passport_status", PASSPORT_STATUSES);
export const reviewDecision = pgEnum("review_decision", REVIEW_DECISIONS);
export const chainStatus = pgEnum("chain_status", CHAIN_STATUSES);
export const backendJobKind = pgEnum("backend_job_kind", ["inspection", "anchor", "delete_photo"]);
export const backendJobStatus = pgEnum("backend_job_status", [
  "pending",
  "running",
  "complete",
  "failed",
]);
