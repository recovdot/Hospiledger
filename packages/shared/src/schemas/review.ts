import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { DAMAGE_SEVERITIES, REVIEW_DECISIONS } from "../enums";
import { damageFindingSchema } from "./inspection";
import { passportSchema } from "./passport";
import { timestampSchema, uuidSchema } from "./primitives";

export const sellerReviewSchema = z.object({
  id: uuidSchema,
  passportId: uuidSchema,
  reviewerId: uuidSchema.nullable(),
  decision: z.enum(REVIEW_DECISIONS),
  edits: z.record(z.string(), z.unknown()).nullable(),
  notes: z.string().nullable(),
  reviewedAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const sellerCorrectionsSchema = z.strictObject({
  category: z.string().trim().min(1).max(100).optional(),
  brand: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  serialNumber: z.string().trim().min(1).max(100).nullable().optional(),
  year: z.int().min(1900).max(2100).nullable().optional(),
  capacity: z.string().trim().min(1).max(100).nullable().optional(),
  location: z.string().trim().min(1).max(200).nullable().optional(),
  previousUsage: z.string().trim().min(1).max(2000).nullable().optional(),
  conditionScore: z.int().min(0).max(100).optional(),
  grade: z.string().trim().min(1).max(3).optional(),
  damageSeverity: z.enum(DAMAGE_SEVERITIES).nullable().optional(),
  damage: z.array(damageFindingSchema).optional(),
});

const reviewAssetCodeSchema = z.object({ assetCode: assetCodeSchema });

export const reviewsSubmitInput = z.discriminatedUnion("decision", [
  reviewAssetCodeSchema.extend({
    decision: z.literal("accept"),
  }).strict(),
  reviewAssetCodeSchema.extend({
    decision: z.literal("edit"),
    edits: sellerCorrectionsSchema.optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  }).strict().refine(
    (input) => Object.keys(input.edits ?? {}).length > 0 || input.notes !== undefined,
    { message: "Isi perbaikan atau catatan sebelum mengirim." },
  ),
]);

export const reviewsSubmitOutput = z.object({
  passport: passportSchema,
  review: sellerReviewSchema,
});

export type SellerReview = z.infer<typeof sellerReviewSchema>;
export type ReviewsSubmitInput = z.infer<typeof reviewsSubmitInput>;
export type SellerCorrections = z.infer<typeof sellerCorrectionsSchema>;
export type ReviewsSubmitOutput = z.infer<typeof reviewsSubmitOutput>;
