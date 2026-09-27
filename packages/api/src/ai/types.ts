import type { ConditionScore, DamageFinding, DamageSeverity, InspectionProgress, InspectionRawOutput, NameplateOcr, PhotoType } from "@hospiledger/shared";

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
  scoreComponents: ConditionScore;
  rawOutput: InspectionRawOutput;
  valueEstimate: number | null;
  valueMin: number | null;
  valueMax: number | null;
};

export type InspectionProgressHook = {
  /** Called after each pipeline step so the caller can persist live progress. */
  onProgress: (progress: InspectionProgress) => Promise<void> | void;
};

export type InspectionAi = { inspect(request: InspectionRequest, hooks?: InspectionProgressHook): Promise<InspectionOutcome> };

/** Inspection failure with a seller-safe message and an explicit worker retry decision. */
export class AiInspectionError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "AiInspectionError";
    this.retryable = retryable;
  }
}
