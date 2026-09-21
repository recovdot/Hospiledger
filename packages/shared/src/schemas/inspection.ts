import { z } from "zod";

import { DAMAGE_KINDS, DAMAGE_SEVERITIES, INSPECTION_STATUSES, PASSPORT_STATUSES } from "../enums";
import { assetPhotoSchema } from "./photo";
import { confidenceSchema, moneySchema, timestampSchema, uuidSchema } from "./primitives";

export const nameplateOcrSchema = z.object({
  serialNumber: z.string().nullable(),
  voltage: z.string().nullable(),
  capacity: z.string().nullable(),
  manufacturingDate: z.string().nullable(),
});

export const damageFindingSchema = z.object({
  kind: z.enum(DAMAGE_KINDS),
  severity: z.enum(DAMAGE_SEVERITIES),
  area: z.string().nullable(),
  note: z.string().nullable(),
});

export const conditionScoreSchema = z.object({
  physical: z.int().min(0).max(100),
  visual: z.int().min(0).max(100),
  completeness: z.int().min(0).max(100),
  overall: z.int().min(0).max(100),
  grade: z.string().min(1).max(3),
});

export const valueEstimateSchema = z.object({
  estimate: moneySchema.nullable(),
  min: moneySchema.nullable(),
  max: moneySchema.nullable(),
  confidence: confidenceSchema.nullable(),
  basis: z.string().nullable(),
});

export const aiInspectionSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  status: z.enum(INSPECTION_STATUSES),
  detectedBrand: z.string().nullable(),
  detectedModel: z.string().nullable(),
  confidence: confidenceSchema.nullable(),
  ocrResult: nameplateOcrSchema.nullable(),
  damageResult: z.array(damageFindingSchema).nullable(),
  damageSeverity: z.enum(DAMAGE_SEVERITIES).nullable(),
  conditionScore: z.int().min(0).max(100).nullable(),
  grade: z.string().nullable(),
  valueEstimate: moneySchema.nullable(),
  valueMin: moneySchema.nullable(),
  valueMax: moneySchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const inspectionsStartInput = z.object({ assetId: uuidSchema });

export const inspectionsStartOutput = z.object({
  inspectionId: uuidSchema,
  status: z.literal("processing"),
});

export const inspectionsGetInput = z.object({ assetId: uuidSchema });

export const inspectionsGetOutput = z.object({
  inspection: aiInspectionSchema.nullable(),
  passportStatus: z.enum(PASSPORT_STATUSES).nullable(),
  photos: z.array(assetPhotoSchema),
});

export type NameplateOcr = z.infer<typeof nameplateOcrSchema>;
export type DamageFinding = z.infer<typeof damageFindingSchema>;
export type ConditionScore = z.infer<typeof conditionScoreSchema>;
export type ValueEstimate = z.infer<typeof valueEstimateSchema>;
export type AiInspection = z.infer<typeof aiInspectionSchema>;
export type InspectionsStartInput = z.infer<typeof inspectionsStartInput>;
export type InspectionsStartOutput = z.infer<typeof inspectionsStartOutput>;
export type InspectionsGetInput = z.infer<typeof inspectionsGetInput>;
export type InspectionsGetOutput = z.infer<typeof inspectionsGetOutput>;
