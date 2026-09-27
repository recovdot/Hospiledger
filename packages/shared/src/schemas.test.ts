import { describe, expect, test } from "bun:test";

import { MAX_PHOTO_BYTES } from "./limits";
import { canonicalJson, sha256Hex } from "./hashing";
import { hashPassportContent, passportContentSchema } from "./passport-content";
import { photosCreateUploadUrlInput } from "./schemas/photo";
import { reviewsSubmitInput } from "./schemas/review";

describe("reviewsSubmitInput", () => {
  test("rejects an edit decision with neither edits nor notes", () => {
    expect(reviewsSubmitInput.safeParse({ assetCode: "HPL-2026-00001", decision: "edit" }).success).toBe(false);
    expect(
      reviewsSubmitInput.safeParse({ assetCode: "HPL-2026-00001", decision: "edit", edits: {}, notes: "   " }).success,
    ).toBe(false);
  });

  test("accepts an accept decision and a bounded edit", () => {
    expect(reviewsSubmitInput.safeParse({ assetCode: "HPL-2026-00001", decision: "accept" }).success).toBe(true);
    expect(
      reviewsSubmitInput.safeParse({
        assetCode: "HPL-2026-00001",
        decision: "edit",
        edits: { grade: "B+", serialNumber: null, damage: [] },
      }).success,
    ).toBe(true);
  });

  test("rejects unknown correction fields and accept metadata", () => {
    expect(reviewsSubmitInput.safeParse({
      assetCode: "HPL-2026-00001", decision: "edit", edits: { valueEstimate: 4_000_000 },
    }).success).toBe(false);
    expect(reviewsSubmitInput.safeParse({
      assetCode: "HPL-2026-00001", decision: "accept", notes: "Tidak boleh ada catatan pada persetujuan.",
    }).success).toBe(false);
  });
});

describe("photosCreateUploadUrlInput", () => {
  test("rejects an oversized file and an unsupported content type", () => {
    const base = { assetId: "8f14e45f-1a2b-4c3d-8e9f-0a1b2c3d4e5f", type: "front" as const };
    expect(photosCreateUploadUrlInput.safeParse({ ...base, contentType: "image/jpeg", fileSize: MAX_PHOTO_BYTES + 1 }).success).toBe(false);
    expect(photosCreateUploadUrlInput.safeParse({ ...base, contentType: "image/gif", fileSize: 1024 }).success).toBe(false);
    expect(photosCreateUploadUrlInput.safeParse({ ...base, contentType: "image/webp", fileSize: MAX_PHOTO_BYTES }).success).toBe(true);
  });
});

describe("passportContentSchema", () => {
  test("rejects a photo whose hash is not 64 hex characters", () => {
    const content = {
      assetCode: "HPL-2026-00001",
      version: 1,
      asset: {
        category: "refrigerator",
        brand: "Acme",
        model: "X1",
        serialNumber: null,
        year: 2020,
        capacity: null,
        location: null,
        previousUsage: null,
      },
      inspection: {
        detectedBrand: null,
        detectedModel: null,
        confidence: null,
        ocr: { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null },
        damage: [],
        damageSeverity: null,
        conditionScore: null,
        grade: null,
        valueEstimate: null,
        valueMin: null,
        valueMax: null,
      },
      sellerEdits: null,
      sellerNotes: null,
      photos: [{ type: "front", fileSha256: "a".repeat(63) }],
    };
    expect(passportContentSchema.safeParse(content).success).toBe(false);
  });

  test("preserves the legacy hash when score components are absent", () => {
    const legacyContent = {
      assetCode: "HPL-2026-00001",
      version: 1,
      asset: { category: "refrigerator", brand: "Acme", model: "X1", serialNumber: null, year: 2020, capacity: null, location: null, previousUsage: null },
      inspection: {
        detectedBrand: null, detectedModel: null, confidence: null,
        ocr: { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null },
        damage: [], damageSeverity: null, conditionScore: null, grade: null,
        valueEstimate: null, valueMin: null, valueMax: null,
      },
      sellerEdits: null,
      sellerNotes: null,
      photos: [{ type: "front" as const, fileSha256: "a".repeat(64) }],
    };
    expect(hashPassportContent(legacyContent)).toBe(sha256Hex(canonicalJson(legacyContent)));
  });
});
