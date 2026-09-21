import { z } from "zod";

import {
  conditionScoreSchema,
  DAMAGE_SEVERITIES,
  damageFindingSchema,
  nameplateOcrSchema,
  valueEstimateSchema,
} from "@hospiledger/shared";
import type { DamageFinding, NameplateOcr } from "@hospiledger/shared";

import type { ApiConfig } from "../config";
import type { Logger } from "../logger";
import { createStructuredChatClient, StructuredChatValidationError } from "./client";
import { AGGREGATION_SYSTEM_PROMPT, VISION_SYSTEM_PROMPT, buildAggregationPrompt, buildVisionPrompt } from "./prompts";
import { AiInspectionError } from "./types";
import type { InspectionAi, InspectionOutcome, InspectionPhoto, InspectionRequest } from "./types";

/** Hard provider limit: at most three images per request. */
const MAX_IMAGES_PER_VISION_CALL = 3;
const VISION_SCHEMA_NAME = "hospiledger_equipment_recognition";
const ASSESSMENT_SCHEMA_NAME = "hospiledger_condition_assessment";
const VISION_MAX_COMPLETION_TOKENS = 1600;
const ASSESSMENT_MAX_COMPLETION_TOKENS = 900;

type InspectionStage = { key: string; label: string };

const RECOGNITION_STAGE: InspectionStage = { key: "recognition", label: "pengenalan peralatan" };
const ASSESSMENT_STAGE: InspectionStage = { key: "assessment", label: "penilaian kondisi dan estimasi nilai" };

const visionStageSchema = z.strictObject({
  detectedBrand: z.string().nullable(),
  detectedModel: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  ocr: z.strictObject(nameplateOcrSchema.shape),
  damage: z.array(z.strictObject(damageFindingSchema.shape)),
  photoNotes: z.string(),
});

const assessmentStageSchema = z.strictObject({
  damageSeverity: z.enum(DAMAGE_SEVERITIES).nullable(),
  ...conditionScoreSchema.shape,
  valueEstimate: valueEstimateSchema.shape.estimate,
  valueMin: valueEstimateSchema.shape.min,
  valueMax: valueEstimateSchema.shape.max,
  valueConfidence: valueEstimateSchema.shape.confidence,
  valueBasis: valueEstimateSchema.shape.basis,
});

type RecognitionReading = z.infer<typeof visionStageSchema>;
type ConditionAssessment = z.infer<typeof assessmentStageSchema>;

function divideIntoBatches(photos: readonly InspectionPhoto[], size: number): InspectionPhoto[][] {
  const batches: InspectionPhoto[][] = [];
  for (let index = 0; index < photos.length; index += size) batches.push(photos.slice(index, index + size));
  return batches;
}

function firstNonNull<T>(candidates: readonly (T | null)[]): T | null {
  for (const candidate of candidates) {
    if (candidate !== null) return candidate;
  }
  return null;
}

/** Reads each nameplate field from the first batch that could read it; unreadable fields stay null. */
function mergeOcr(readings: readonly RecognitionReading[]): NameplateOcr {
  return {
    serialNumber: firstNonNull(readings.map((reading) => reading.ocr.serialNumber)),
    voltage: firstNonNull(readings.map((reading) => reading.ocr.voltage)),
    capacity: firstNonNull(readings.map((reading) => reading.ocr.capacity)),
    manufacturingDate: firstNonNull(readings.map((reading) => reading.ocr.manufacturingDate)),
  };
}

/**
 * Creates the AI inspection module.
 *
 * `inspect` runs one vision call per batch of at most three photos and one photo-free scoring and
 * valuation call, then merges the stage results. A reply that fails schema validation is asked for
 * once more; a second failure, or any provider failure, becomes an `AiInspectionError` naming the
 * stage so the caller can fail the inspection with a seller-facing message.
 *
 * @param config API configuration carrying the provider credentials and model
 * @param logger structured logger for stage progress and failures
 * @returns the inspection module
 */
export function createInspectionAi(config: ApiConfig, logger: Logger): InspectionAi {
  const client = createStructuredChatClient(config, logger);

  const failStage = (stage: InspectionStage, error: unknown): never => {
    logger.error("Tahap inspeksi AI gagal.", {
      stage: stage.key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AiInspectionError(
      error instanceof StructuredChatValidationError
        ? `Hasil inspeksi AI tidak lolos validasi pada tahap ${stage.label}.`
        : `Layanan inspeksi AI gagal pada tahap ${stage.label}.`,
    );
  };

  const runStage = async <T>(stage: InspectionStage, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof StructuredChatValidationError)) return failStage(stage, error);
      logger.warn("Balasan AI tidak lolos validasi, mengulang tahap.", { stage: stage.key });
    }
    try {
      return await run();
    } catch (error) {
      return failStage(stage, error);
    }
  };

  const inspect = async (request: InspectionRequest): Promise<InspectionOutcome> => {
    if (request.photos.length === 0) {
      throw new AiInspectionError("Inspeksi AI memerlukan minimal satu foto bukti peralatan.");
    }

    const readings: RecognitionReading[] = [];
    // Batches run one after another so the provider's org-wide tokens-per-minute budget is not blown.
    for (const batch of divideIntoBatches(request.photos, MAX_IMAGES_PER_VISION_CALL)) {
      readings.push(
        await runStage(RECOGNITION_STAGE, () =>
          client.complete({
            schema: visionStageSchema,
            schemaName: VISION_SCHEMA_NAME,
            system: VISION_SYSTEM_PROMPT,
            prompt: buildVisionPrompt(batch),
            imageUrls: batch.map((photo) => photo.url),
            maxCompletionTokens: VISION_MAX_COMPLETION_TOKENS,
          }),
        ),
      );
    }

    const damage: DamageFinding[] = readings.flatMap((reading) => reading.damage);
    const assessment: ConditionAssessment = await runStage(ASSESSMENT_STAGE, () =>
      client.complete({
        schema: assessmentStageSchema,
        schemaName: ASSESSMENT_SCHEMA_NAME,
        system: AGGREGATION_SYSTEM_PROMPT,
        prompt: buildAggregationPrompt({
          asset: request.asset,
          damage,
          photoNotes: readings.map((reading) => reading.photoNotes),
        }),
        imageUrls: [],
        maxCompletionTokens: ASSESSMENT_MAX_COMPLETION_TOKENS,
      }),
    );

    return {
      detectedBrand: firstNonNull(readings.map((reading) => reading.detectedBrand)),
      detectedModel: firstNonNull(readings.map((reading) => reading.detectedModel)),
      confidence: firstNonNull(readings.map((reading) => reading.confidence)),
      ocr: mergeOcr(readings),
      damage,
      damageSeverity: assessment.damageSeverity,
      conditionScore: assessment.overall,
      grade: assessment.grade,
      valueEstimate: assessment.valueEstimate,
      valueMin: assessment.valueMin,
      valueMax: assessment.valueMax,
    };
  };

  return { inspect };
}
