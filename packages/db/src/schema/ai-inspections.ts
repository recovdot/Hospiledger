import type { ConditionScore, DamageFinding, InspectionProgress, InspectionRawOutput, NameplateOcr } from "@hospiledger/shared";
import { index, integer, jsonb, numeric, text, uuid, varchar } from "drizzle-orm/pg-core";

import { assets } from "./assets";
import { damageSeverity, inspectionStatus } from "./enums";
import { pgTable, timestamps } from "./_shared";

export const aiInspections = pgTable.withRLS(
  "ai_inspections",
  {
    id: uuid().defaultRandom().primaryKey(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    status: inspectionStatus().notNull().default("processing"),
    progress: jsonb().$type<InspectionProgress>(),
    detectedBrand: varchar({ length: 100 }),
    detectedModel: varchar({ length: 100 }),
    confidence: numeric({ precision: 4, scale: 3, mode: "number" }),
    ocrResult: jsonb().$type<NameplateOcr>(),
    damageResult: jsonb().$type<DamageFinding[]>(),
    damageSeverity: damageSeverity(),
    conditionScore: integer(),
    grade: varchar({ length: 3 }),
    scoreComponents: jsonb().$type<ConditionScore>(),
    rawOutput: jsonb().$type<InspectionRawOutput>(),
    valueEstimate: numeric({ precision: 14, scale: 2, mode: "number" }),
    valueMin: numeric({ precision: 14, scale: 2, mode: "number" }),
    valueMax: numeric({ precision: 14, scale: 2, mode: "number" }),
    failureReason: text(),
    ...timestamps,
  },
  (table) => [index("ai_inspections_asset_id_idx").on(table.assetId)],
);
