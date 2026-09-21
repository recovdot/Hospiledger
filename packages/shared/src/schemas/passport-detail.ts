import { z } from "zod";

import { assetSchema } from "./asset";
import { aiInspectionSchema } from "./inspection";
import { anchorVerificationSchema, passportSchema } from "./passport";
import { assetPhotoWithUrlSchema } from "./photo";
import { sellerReviewSchema } from "./review";

export const passportsGetOutput = z.object({
  passport: passportSchema,
  asset: assetSchema,
  photos: z.array(assetPhotoWithUrlSchema),
  inspection: aiInspectionSchema.nullable(),
  reviews: z.array(sellerReviewSchema),
  verification: anchorVerificationSchema.nullable(),
});

export type PassportsGetOutput = z.infer<typeof passportsGetOutput>;
