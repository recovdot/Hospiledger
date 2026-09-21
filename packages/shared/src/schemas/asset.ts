import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { PASSPORT_STATUSES } from "../enums";
import { passportSchema } from "./passport";
import { timestampSchema, uuidSchema } from "./primitives";

export const assetSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema,
  createdBy: uuidSchema.nullable(),
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  serialNumber: z.string().nullable(),
  year: z.int().nullable(),
  capacity: z.string().nullable(),
  location: z.string().nullable(),
  previousUsage: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const assetsCreateInput = z.object({
  category: z.string().min(1).max(100),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  serialNumber: z.string().max(100).optional(),
  year: z.int().min(1900).max(2100).optional(),
  capacity: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  previousUsage: z.string().max(2000).optional(),
});

export const assetsGetInput = z.object({ assetId: uuidSchema });

export const assetsCreateOutput = z.object({
  asset: assetSchema,
  passport: passportSchema,
});

export const assetsListInput = z.object({
  limit: z.int().min(1).max(100).default(20),
  offset: z.int().min(0).default(0),
});

export const assetListItemSchema = z.object({
  asset: assetSchema,
  assetCode: assetCodeSchema.nullable(),
  passportStatus: z.enum(PASSPORT_STATUSES).nullable(),
});

export const assetsListOutput = z.object({
  items: z.array(assetListItemSchema),
  total: z.int(),
});

export type Asset = z.infer<typeof assetSchema>;
export type AssetsCreateInput = z.infer<typeof assetsCreateInput>;
export type AssetsCreateOutput = z.infer<typeof assetsCreateOutput>;
export type AssetsGetInput = z.infer<typeof assetsGetInput>;
export type AssetsListInput = z.infer<typeof assetsListInput>;
export type AssetListItem = z.infer<typeof assetListItemSchema>;
export type AssetsListOutput = z.infer<typeof assetsListOutput>;
