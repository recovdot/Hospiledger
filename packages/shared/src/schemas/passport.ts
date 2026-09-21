import { z } from "zod";

import { assetCodeSchema } from "../asset-code";
import { CHAIN_STATUSES, PASSPORT_STATUSES, VERIFICATION_RESULTS } from "../enums";
import { hex64Schema, timestampSchema, uuidSchema } from "./primitives";

export const chainAnchorSchema = z.object({
  version: z.int(),
  chainStatus: z.enum(CHAIN_STATUSES),
  chainCluster: z.string().nullable(),
  txSignature: z.string().nullable(),
  slot: z.int().nullable(),
  anchoredAt: timestampSchema.nullable(),
});

export const passportRecordSchema = z.object({
  id: uuidSchema,
  passportId: uuidSchema,
  inspectionId: uuidSchema.nullable(),
  version: z.int(),
  chainStatus: z.enum(CHAIN_STATUSES),
  chainCluster: z.string().nullable(),
  txSignature: z.string().nullable(),
  slot: z.int().nullable(),
  anchoredAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const passportSchema = z.object({
  id: uuidSchema,
  assetCode: assetCodeSchema,
  assetId: uuidSchema,
  inspectionId: uuidSchema.nullable(),
  status: z.enum(PASSPORT_STATUSES),
  publishedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  chain: chainAnchorSchema.nullable(),
});

export const anchorVerificationSchema = z.object({
  result: z.enum(VERIFICATION_RESULTS),
  txSignature: z.string().nullable(),
  chainCluster: z.string().nullable(),
  memoAssetCode: z.string().nullable(),
  memoVersion: z.int().nullable(),
  memoContentHash: hex64Schema.nullable(),
  recomputedContentHash: hex64Schema.nullable(),
  checkedAt: timestampSchema,
});

export const passportsGetInput = z.object({ assetCode: assetCodeSchema });

export const passportsPublishInput = z.object({ assetCode: assetCodeSchema });

export const passportsPublishOutput = z.object({
  passport: passportSchema,
  record: passportRecordSchema,
});

export const passportsRetryAnchorInput = z.object({ assetCode: assetCodeSchema });

export const passportsRetryAnchorOutput = z.object({ record: passportRecordSchema });

export type ChainAnchor = z.infer<typeof chainAnchorSchema>;
export type PassportRecord = z.infer<typeof passportRecordSchema>;
export type Passport = z.infer<typeof passportSchema>;
export type AnchorVerification = z.infer<typeof anchorVerificationSchema>;
export type PassportsGetInput = z.infer<typeof passportsGetInput>;
export type PassportsPublishInput = z.infer<typeof passportsPublishInput>;
export type PassportsPublishOutput = z.infer<typeof passportsPublishOutput>;
export type PassportsRetryAnchorInput = z.infer<typeof passportsRetryAnchorInput>;
export type PassportsRetryAnchorOutput = z.infer<typeof passportsRetryAnchorOutput>;
