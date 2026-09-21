import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { REVIEW_DECISIONS } from "../enums";
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

export const reviewsSubmitInput = z
  .object({
    assetCode: assetCodeSchema,
    decision: z.enum(REVIEW_DECISIONS),
    edits: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (input) =>
      input.decision === "accept" || Object.keys(input.edits ?? {}).length > 0 || (input.notes ?? "").trim().length > 0,
    { message: "Isi perbaikan atau catatan sebelum mengirim." },
  );

export const reviewsSubmitOutput = z.object({
  passport: passportSchema,
  review: sellerReviewSchema,
});

export type SellerReview = z.infer<typeof sellerReviewSchema>;
export type ReviewsSubmitInput = z.infer<typeof reviewsSubmitInput>;
export type ReviewsSubmitOutput = z.infer<typeof reviewsSubmitOutput>;
