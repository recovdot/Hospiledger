import { describe, expect, test } from "bun:test";

import { InvalidMemoError, buildMemo, parseMemo } from "./memo";

const HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("buildMemo", () => {
  test("formats the versioned memo", () => {
    expect(buildMemo({ assetCode: "HPL-2026-00001", version: 1, contentHash: HASH })).toBe(
      `hpl:v1:HPL-2026-00001:1:${HASH}`,
    );
  });

  test("rejects a malformed content hash", () => {
    expect(() => buildMemo({ assetCode: "HPL-2026-00001", version: 1, contentHash: HASH.slice(0, 63) })).toThrow(
      InvalidMemoError,
    );
    expect(() => buildMemo({ assetCode: "HPL-2026-00001", version: 1, contentHash: HASH.toUpperCase() })).toThrow(
      InvalidMemoError,
    );
  });

  test("rejects a malformed asset code and version", () => {
    expect(() => buildMemo({ assetCode: "HPL-26-1", version: 1, contentHash: HASH })).toThrow(InvalidMemoError);
    expect(() => buildMemo({ assetCode: "HPL-2026-00001", version: 0, contentHash: HASH })).toThrow(InvalidMemoError);
  });
});

describe("parseMemo", () => {
  test("round-trips a built memo", () => {
    const payload = { assetCode: "HPL-2026-00042", version: 7, contentHash: HASH };
    expect(parseMemo(buildMemo(payload))).toEqual(payload);
  });

  test("returns null on any mismatch", () => {
    expect(parseMemo(`hpl:v2:HPL-2026-00001:1:${HASH}`)).toBeNull();
    expect(parseMemo("garbage")).toBeNull();
    expect(parseMemo(`hpl:v1:HPL-2026-00001:1:${HASH.slice(0, 63)}`)).toBeNull();
    expect(parseMemo(`hpl:v1:HPL-2026-00001:0:${HASH}`)).toBeNull();
    expect(parseMemo(`hpl:v1:HPL-26-1:1:${HASH}`)).toBeNull();
    expect(parseMemo(`hpl:v1:HPL-2026-00001:1:`)).toBeNull();
  });
});
