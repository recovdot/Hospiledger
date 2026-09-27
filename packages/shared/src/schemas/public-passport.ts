import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { DAMAGE_SEVERITIES, PHOTO_TYPES } from "../enums";
import { conditionScoreSchema, damageFindingSchema } from "./inspection";
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
  previousUsage: z.string().nullable(),
  conditionScore: z.int().nullable(),
  grade: z.string().nullable(),
  damageSeverity: z.enum(DAMAGE_SEVERITIES).nullable(),
  damage: z.array(damageFindingSchema),
  valueEstimate: moneySchema.nullable(),
  valueMin: moneySchema.nullable(),
  valueMax: moneySchema.nullable(),
  scoreComponents: conditionScoreSchema.nullable(),
  photos: z.array(publicPassportPhotoSchema),
  publishedAt: timestampSchema,
  sellerEdits: z.record(z.string(), z.unknown()).nullable(),
  sellerNotes: z.string().nullable(),
  sellerCompanyName: z.string().nullable(),
  chain: chainAnchorSchema,
  verification: anchorVerificationSchema,
});

export const publicPassportsGetByCodeInput = z.object({ assetCode: assetCodeSchema });

export const publicPassportsGetByCodeOutput = z.object({ passport: publicPassportSchema });

export const publicPassportsVerifyInput = z.object({ assetCode: assetCodeSchema });

export const publicPassportsVerifyOutput = z.object({ verification: anchorVerificationSchema });

export const publicPassportListItemSchema = z.object({
  assetCode: assetCodeSchema,
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  conditionScore: z.int().nullable(),
  grade: z.string().nullable(),
  valueEstimate: moneySchema.nullable(),
  valueMin: moneySchema.nullable(),
  valueMax: moneySchema.nullable(),
  coverPhotoUrl: z.string().nullable(),
  publishedAt: timestampSchema,
});

export const publicPassportsListInput = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  limit: z.int().min(1).max(50).default(20),
  offset: z.int().min(0).default(0),
});

export const publicPassportsListOutput = z.object({
  items: z.array(publicPassportListItemSchema),
  total: z.int(),
});

export type PublicPassportPhoto = z.infer<typeof publicPassportPhotoSchema>;
export type PublicPassport = z.infer<typeof publicPassportSchema>;
export type PublicPassportsGetByCodeInput = z.infer<typeof publicPassportsGetByCodeInput>;
export type PublicPassportsGetByCodeOutput = z.infer<typeof publicPassportsGetByCodeOutput>;
export type PublicPassportsVerifyInput = z.infer<typeof publicPassportsVerifyInput>;
export type PublicPassportsVerifyOutput = z.infer<typeof publicPassportsVerifyOutput>;
export type PublicPassportListItem = z.infer<typeof publicPassportListItemSchema>;
export type PublicPassportsListInput = z.infer<typeof publicPassportsListInput>;
export type PublicPassportsListOutput = z.infer<typeof publicPassportsListOutput>;
