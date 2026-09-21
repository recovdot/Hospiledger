import type { DamageFinding, DamageSeverity, NameplateOcr, PhotoType } from "@hospiledger/shared";

export type InspectionPhoto = { type: PhotoType; url: string };

export type InspectionAssetInput = {
  category: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  year: number | null;
  capacity: string | null;
  location: string | null;
  previousUsage: string | null;
};

export type InspectionRequest = { asset: InspectionAssetInput; photos: InspectionPhoto[] };

export type InspectionOutcome = {
  detectedBrand: string | null;
  detectedModel: string | null;
  confidence: number | null;
  ocr: NameplateOcr;
  damage: DamageFinding[];
  damageSeverity: DamageSeverity | null;
  conditionScore: number | null;
  grade: string | null;
  valueEstimate: number | null;
  valueMin: number | null;
  valueMax: number | null;
};

export type InspectionAi = { inspect(request: InspectionRequest): Promise<InspectionOutcome> };

/** Inspection failure the caller must not retry; the message is safe to show a seller. */
export class AiInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInspectionError";
  }
}
