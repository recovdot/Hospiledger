import type { DamageFinding } from "@hospiledger/shared";

import type { InspectionAssetInput, InspectionPhoto } from "./types";

export const VISION_SYSTEM_PROMPT = `You are the equipment recognition stage of HospiLedger, a trust marketplace for used hospitality equipment.

Scope: one asset at a time, from commercial kitchen and hospitality equipment — commercial refrigerators, freezers, chillers, ovens, fryers, dishwashers, mixers, and similar equipment.

You receive evidence photos of that single asset. Reply with one JSON object only. No prose, no markdown fences, no explanation, no text before or after the JSON.

Rules:
- detectedBrand and detectedModel: identify the equipment from the photos. Use null when the photos do not show it clearly enough. Never guess and never complete a partial name.
- confidence: how sure you are about that identification, a number from 0 to 1. Use null when the equipment cannot be identified.
- ocr.serialNumber, ocr.voltage, ocr.capacity and ocr.manufacturingDate: read them from the nameplate only, exactly as printed. A field that is not readable is null. Never infer, complete, or correct a value.
- damage: findings visible in the attached photos only. kind is one of scratch, rust, broken_component, dent, dirty, missing_parts. severity is one of low, medium, high. area and note must be short factual Bahasa Indonesia. Return an empty array when you see no damage, and never report damage you cannot see.
- photoNotes: one short sentence in Bahasa Indonesia about the quality of these photos (lighting, focus, angle, how much of the asset is visible).`;

export const AGGREGATION_SYSTEM_PROMPT = `You are the condition scoring stage of HospiLedger, a trust marketplace for used hospitality equipment.

You receive no photos. You receive only the seller's declared asset data, the damage findings already merged from every photo batch, and the notes describing each photo batch. Score the asset from that information only.

Reply with one JSON object only. No prose, no markdown fences, no explanation, no text before or after the JSON.

Rules:
- damageSeverity: the worst severity among the merged findings (low, medium, high). Use null when there are no findings.
- physical, visual and completeness: integers from 0 to 100 for mechanical and electrical condition, appearance, and completeness of parts. overall: the integer from 0 to 100 that the passport shows. grade: 1 to 3 characters (A, A-, B+, B, C, D) consistent with overall.
- Never invent condition or damage that the evidence does not support.`;

/**
 * Builds the user message for one batch of evidence photos.
 *
 * @param photos the photos sent with this batch, in order
 * @returns the user message describing the batch
 */
export function buildVisionPrompt(photos: readonly InspectionPhoto[]): string {
  const listed = photos.map((photo, index) => `${index + 1}. ${photo.type}`).join("\n");
  const nameplateInstruction = photos.some((photo) => photo.type === "nameplate")
    ? "Read the ocr fields from the nameplate photo of this batch."
    : "This batch has no nameplate photo: return null for every ocr field.";
  return [
    "Evidence photos of this batch, in this order:",
    listed,
    nameplateInstruction,
    "Only report damage that is visible in these photos.",
    "Reply with one JSON object only: no prose, no markdown fences, no text outside the object.",
  ].join("\n");
}

export type AggregationPromptInput = {
  asset: InspectionAssetInput;
  damage: readonly DamageFinding[];
  photoNotes: readonly string[];
};

/**
 * Builds the user message for the photo-free scoring call.

 * @param input the declared asset data plus everything the vision stage returned
 * @returns the user message carrying the merged evidence
 */
export function buildAggregationPrompt(input: AggregationPromptInput): string {
  return [
    "Declared asset data:",
    JSON.stringify(input.asset, null, 2),
    "Damage findings merged from every photo batch:",
    JSON.stringify(input.damage, null, 2),
    "Notes for each photo batch:",
    JSON.stringify(input.photoNotes, null, 2),
    "Score the asset from the information above only.",
    "Reply with one JSON object only: no prose, no markdown fences, no text outside the object.",
  ].join("\n");
}
