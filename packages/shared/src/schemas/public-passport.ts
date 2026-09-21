import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { DAMAGE_SEVERITIES, PHOTO_TYPES } from "../enums";
import { damageFindingSchema } from "./inspection";
import { anchorVerificationSchema, chainAnchorSchema } from "./passport";
import { moneySchema, timestampSchema } from "./primitives";

export const publicPassportPhotoSchema = z.object({
  type: z.enum(PHOTO_TYPES),
  signedUrl: z.string(),
});

export const publicPassportSchema = z.object({
  assetCode: assetCodeSchema,
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  serialNumber: z.string().nullable(),
  year: z.int().nullable(),
  capacity: z.string().nullable(),
  location: z.string().nullable(),
  conditionScore: z.int().nullable(),
  grade: z.string().nullable(),
  damageSeverity: z.enum(DAMAGE_SEVERITIES).nullable(),
  damage: z.array(damageFindingSchema),
  valueEstimate: moneySchema.nullable(),
  valueMin: moneySchema.nullable(),
  valueMax: moneySchema.nullable(),
  photos: z.array(publicPassportPhotoSchema),
  publishedAt: timestampSchema,
  chain: chainAnchorSchema,
  verification: anchorVerificationSchema,
});

export const publicPassportsGetByCodeInput = z.object({ assetCode: assetCodeSchema });

export const publicPassportsGetByCodeOutput = z.object({ passport: publicPassportSchema });

export const publicPassportsVerifyInput = z.object({ assetCode: assetCodeSchema });

export const publicPassportsVerifyOutput = z.object({ verification: anchorVerificationSchema });

export type PublicPassportPhoto = z.infer<typeof publicPassportPhotoSchema>;
export type PublicPassport = z.infer<typeof publicPassportSchema>;
export type PublicPassportsGetByCodeInput = z.infer<typeof publicPassportsGetByCodeInput>;
export type PublicPassportsGetByCodeOutput = z.infer<typeof publicPassportsGetByCodeOutput>;
export type PublicPassportsVerifyInput = z.infer<typeof publicPassportsVerifyInput>;
export type PublicPassportsVerifyOutput = z.infer<typeof publicPassportsVerifyOutput>;
