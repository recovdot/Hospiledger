import { describe, expect, test } from "bun:test";

import type { AssetPhotoRow } from "./rows";
import { findMissingRequiredPhotos } from "./photos";

function photo(type: AssetPhotoRow["type"], qualityOk: boolean, qualityReason: string | null = null): AssetPhotoRow {
  return {
    id: `photo-${type}-${qualityOk}`,
    assetId: "8f14e45f-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    type,
    storagePath: `company/asset/${type}.jpg`,
    fileSha256: "a".repeat(64),
    qualityOk,
    qualityReason,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("findMissingRequiredPhotos", () => {
  test("reports every required type when nothing was uploaded", () => {
    expect(findMissingRequiredPhotos([]).map((entry) => entry.type)).toEqual(["front", "side", "back", "nameplate"]);
  });

  test("reports a rejected photo with its stored reason so the seller can act", () => {
    const missing = findMissingRequiredPhotos([
      photo("front", true),
      photo("side", false, "Resolusi foto minimal 640×480. Foto ini 320×240."),
      photo("back", true),
      photo("nameplate", true),
      photo("damage", true),
    ]);
    expect(missing).toEqual([
      { type: "side", reason: "Resolusi foto minimal 640×480. Foto ini 320×240." },
    ]);
  });

  test("accepts an asset whose required photos all passed validation", () => {
    expect(
      findMissingRequiredPhotos([
        photo("front", true),
        photo("side", true),
        photo("back", true),
        photo("nameplate", true),
      ]),
    ).toEqual([]);
  });
});
