import { describe, expect, test } from "bun:test";

import { latestByAssetId } from "./public-passports";

describe("latestByAssetId", () => {
  test("keeps the first row seen per assetId", () => {
    const rows = [
      { assetId: "a", createdAt: 2 },
      { assetId: "b", createdAt: 5 },
      { assetId: "a", createdAt: 1 },
    ];
    const latest = latestByAssetId(rows);
    expect(latest.get("a")).toEqual({ assetId: "a", createdAt: 2 });
    expect(latest.get("b")).toEqual({ assetId: "b", createdAt: 5 });
    expect(latest.size).toBe(2);
  });

  test("returns an empty map for no rows", () => {
    expect(latestByAssetId([]).size).toBe(0);
  });
});
