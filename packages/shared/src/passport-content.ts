import { z } from "zod";

import { assetCodeSchema } from "./asset-code";
import { DAMAGE_KINDS, DAMAGE_SEVERITIES, PHOTO_TYPES } from "./enums";
import { canonicalJson, sha256Hex } from "./hashing";
import { conditionScoreSchema, damageFindingSchema, nameplateOcrSchema } from "./schemas/inspection";
import { confidenceSchema, hex64Schema, moneySchema } from "./schemas/primitives";

export const passportContentSchema = z.object({
  assetCode: assetCodeSchema,
  version: z.int().min(1),
  asset: z.object({
    category: z.string(),
    brand: z.string(),
    model: z.string(),
    serialNumber: z.string().nullable(),
    year: z.int().nullable(),
    capacity: z.string().nullable(),
    location: z.string().nullable(),
    previousUsage: z.string().nullable(),
  }),
  inspection: z.object({
    detectedBrand: z.string().nullable(),
    detectedModel: z.string().nullable(),
    confidence: confidenceSchema.nullable(),
    ocr: nameplateOcrSchema,
    damage: z.array(damageFindingSchema),
    damageSeverity: z.enum(DAMAGE_SEVERITIES).nullable(),
    conditionScore: z.int().nullable(),
    grade: z.string().nullable(),
    valueEstimate: moneySchema.nullable(),
    valueMin: moneySchema.nullable(),
    valueMax: moneySchema.nullable(),
    scoreComponents: conditionScoreSchema.optional(),
  }),
  sellerEdits: z.record(z.string(), z.unknown()).nullable(),
  sellerNotes: z.string().nullable(),
  photos: z.array(z.object({ type: z.enum(PHOTO_TYPES), fileSha256: hex64Schema })),
});

export type PassportContent = z.infer<typeof passportContentSchema>;

/**
 * Determinism rules the content builder must follow so the hash is stable:
 * - photos sorted by {@link PHOTO_TYPES} index, ties broken by `fileSha256`;
 * - damage findings sorted by kind, then `area ?? ""`, then `note ?? ""`;
 * - seller edit keys sorted by their canonical JSON form;
 * - no `Date` values anywhere: dates are ISO strings or null.
 */
export function hashPassportContent(content: PassportContent): string {
  const parsed = passportContentSchema.parse(content);
  const photos = [...parsed.photos].sort((left, right) => {
    const byType = PHOTO_TYPES.indexOf(left.type) - PHOTO_TYPES.indexOf(right.type);
    return byType !== 0 ? byType : left.fileSha256.localeCompare(right.fileSha256);
  });
  const damage = [...parsed.inspection.damage].sort((left, right) => {
    const byKind = DAMAGE_KINDS.indexOf(left.kind) - DAMAGE_KINDS.indexOf(right.kind);
    if (byKind !== 0) return byKind;
    const byArea = (left.area ?? "").localeCompare(right.area ?? "");
    return byArea !== 0 ? byArea : (left.note ?? "").localeCompare(right.note ?? "");
  });
  const sellerEdits = parsed.sellerEdits
    ? Object.fromEntries(Object.entries(parsed.sellerEdits).sort(([left], [right]) => (canonicalJson(left) < canonicalJson(right) ? -1 : 1)))
    : null;
  const normalized: PassportContent = {
    ...parsed,
    sellerEdits,
    photos,
    inspection: { ...parsed.inspection, damage },
  };
  return sha256Hex(canonicalJson(normalized));
}
