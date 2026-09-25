import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { timestampSchema, uuidSchema } from "./primitives";

export const adminFailedAnchorSchema = z.object({
  recordId: uuidSchema,
  version: z.int(),
  updatedAt: timestampSchema,
  assetCode: assetCodeSchema,
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  companyId: uuidSchema,
});

export const adminFailedAnchorsOutput = z.object({
  items: z.array(adminFailedAnchorSchema),
});

export type AdminFailedAnchor = z.infer<typeof adminFailedAnchorSchema>;
export type AdminFailedAnchorsOutput = z.infer<typeof adminFailedAnchorsOutput>;
