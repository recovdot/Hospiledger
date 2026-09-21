import { describe, expect, test } from "bun:test";

import { CanonicalJsonError, canonicalJson, sha256Hex } from "./hashing";

describe("canonicalJson", () => {
  test("is independent of object key order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  test("sorts nested object keys and preserves array order", () => {
    expect(canonicalJson({ outer: { z: 1, a: [3, { n: null, m: true }] } })).toBe(
      '{"outer":{"a":[3,{"m":true,"n":null}],"z":1}}',
    );
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  test("serializes primitives deterministically", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("a\"b")).toBe('"a\\"b"');
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(-1.5)).toBe("-1.5");
  });

  test("rejects values JSON cannot canonicalize", () => {
    expect(() => canonicalJson(undefined)).toThrow(CanonicalJsonError);
    expect(() => canonicalJson(Number.NaN)).toThrow(CanonicalJsonError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(CanonicalJsonError);
    expect(() => canonicalJson(new Date())).toThrow(CanonicalJsonError);
    expect(() => canonicalJson(new Map())).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ nested: undefined })).toThrow(CanonicalJsonError);
  });
});

describe("sha256Hex", () => {
  test("matches the known SHA-256 digest of 'abc'", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
