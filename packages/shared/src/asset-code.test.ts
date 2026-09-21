import { describe, expect, test } from "bun:test";

import { formatAssetCode, parseAssetCode } from "./asset-code";

describe("formatAssetCode", () => {
  test("pads the sequence to five digits", () => {
    expect(formatAssetCode(2026, 1)).toBe("HPL-2026-00001");
    expect(formatAssetCode(2026, 99999)).toBe("HPL-2026-99999");
  });

  test("rejects out-of-range or non-integer input", () => {
    expect(() => formatAssetCode(2026, 0)).toThrow(RangeError);
    expect(() => formatAssetCode(2026, 100000)).toThrow(RangeError);
    expect(() => formatAssetCode(2026, 1.5)).toThrow(RangeError);
    expect(() => formatAssetCode(1999, 1)).toThrow(RangeError);
    expect(() => formatAssetCode(10000, 1)).toThrow(RangeError);
  });
});

describe("parseAssetCode", () => {
  test("round-trips a formatted code", () => {
    expect(parseAssetCode(formatAssetCode(2026, 123))).toEqual({ year: 2026, sequence: 123 });
  });

  test("returns null on a non-matching code", () => {
    expect(parseAssetCode("HPL-26-1")).toBeNull();
    expect(parseAssetCode("HPL-2026-0001")).toBeNull();
    expect(parseAssetCode("")).toBeNull();
  });
});
