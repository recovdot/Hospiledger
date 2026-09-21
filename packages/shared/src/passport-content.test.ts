import { describe, expect, test } from "bun:test";

import { hashPassportContent, passportContentSchema, type PassportContent } from "./passport-content";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function content(overrides: Partial<PassportContent> = {}): PassportContent {
  return {
    assetCode: "HPL-2026-00001",
    version: 1,
    asset: {
      category: "refrigerator",
      brand: "Acme",
      model: "X1",
      serialNumber: "SN-1",
      year: 2020,
      capacity: "400L",
      location: "Gudang A",
      previousUsage: null,
    },
    inspection: {
      detectedBrand: "Acme",
      detectedModel: "X1",
      confidence: 0.9,
      ocr: { serialNumber: "SN-1", voltage: "220V", capacity: "400L", manufacturingDate: null },
      damage: [],
      damageSeverity: "low",
      conditionScore: 82,
      grade: "A-",
      valueEstimate: 5_000_000,
      valueMin: 4_500_000,
      valueMax: 5_500_000,
    },
    sellerEdits: null,
    sellerNotes: null,
    photos: [
      { type: "front", fileSha256: HASH_A },
      { type: "nameplate", fileSha256: HASH_B },
    ],
    ...overrides,
  };
}

describe("hashPassportContent", () => {
  test("is stable for the same content", () => {
    expect(hashPassportContent(content())).toBe(hashPassportContent(content()));
  });

  test("ignores photo order but not photo content", () => {
    const reordered = content({
      photos: [
        { type: "nameplate", fileSha256: HASH_B },
        { type: "front", fileSha256: HASH_A },
      ],
    });
    expect(hashPassportContent(reordered)).toBe(hashPassportContent(content()));

    const swapped = content({
      photos: [
        { type: "front", fileSha256: HASH_B },
        { type: "nameplate", fileSha256: HASH_A },
      ],
    });
    expect(hashPassportContent(swapped)).not.toBe(hashPassportContent(content()));
  });

  test("ignores damage order but not seller edit key order", () => {
    const damage = [
      { kind: "rust" as const, severity: "low" as const, area: "belakang", note: null },
      { kind: "dent" as const, severity: "high" as const, area: null, note: "pintu" },
    ];
    const ordered = content({ inspection: { ...content().inspection, damage } });
    const reversed = content({ inspection: { ...content().inspection, damage: [...damage].reverse() } });
    expect(hashPassportContent(reversed)).toBe(hashPassportContent(ordered));

    const editsA = content({ sellerEdits: { grade: "B+", conditionScore: 70 } });
    const editsB = content({ sellerEdits: { conditionScore: 70, grade: "B+" } });
    expect(hashPassportContent(editsB)).toBe(hashPassportContent(editsA));
  });

  test("changes when any hashed field changes", () => {
    expect(hashPassportContent(content({ version: 2 }))).not.toBe(hashPassportContent(content()));
    expect(hashPassportContent(content({ sellerNotes: "sudah dicek" }))).not.toBe(hashPassportContent(content()));
    expect(
      hashPassportContent(content({ asset: { ...content().asset, model: "X2" } })),
    ).not.toBe(hashPassportContent(content()));
  });

  test("rejects content that does not satisfy the frozen schema", () => {
    expect(() => passportContentSchema.parse(content({ photos: [{ type: "front", fileSha256: "a".repeat(63) }] }))).toThrow();
  });
});
