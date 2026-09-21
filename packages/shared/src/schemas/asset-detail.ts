import { z } from "zod";

import { assetSchema } from "./asset";
import { aiInspectionSchema } from "./inspection";
import { passportSchema } from "./passport";
import { assetPhotoWithUrlSchema } from "./photo";

export const assetsGetOutput = z.object({
  asset: assetSchema,
  photos: z.array(assetPhotoWithUrlSchema),
  passport: passportSchema.nullable(),
  inspection: aiInspectionSchema.nullable(),
});

export type AssetsGetOutput = z.infer<typeof assetsGetOutput>;
