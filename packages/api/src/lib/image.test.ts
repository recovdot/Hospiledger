import { describe, expect, test } from "bun:test";

import { inspectImageHeader, validatePhoto } from "./image";

function pngBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff,
    (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff,
  ]);
}

function jpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x00, 0x00, 0x00,
  ]);
}

function webpBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff,
    (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff,
  ]);
}

describe("inspectImageHeader", () => {
  test("reads dimensions from PNG, JPEG, and WebP headers", () => {
    expect(inspectImageHeader(pngBytes(1024, 768))).toEqual({ format: "image/png", width: 1024, height: 768 });
    expect(inspectImageHeader(jpegBytes(800, 600))).toEqual({ format: "image/jpeg", width: 800, height: 600 });
    expect(inspectImageHeader(webpBytes(1600, 900))).toEqual({ format: "image/webp", width: 1600, height: 900 });
  });

  test("does not mistake unrelated bytes for a raster image", () => {
    expect(inspectImageHeader(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).format).toBeNull();
  });
});

describe("validatePhoto", () => {
  test("accepts a photo that matches the declared type and the minimum resolution", () => {
    expect(validatePhoto(pngBytes(800, 600), "image/png")).toEqual({ qualityOk: true, qualityReason: null });
  });

  test("rejects a mismatched content type with a reason the seller can act on", () => {
    const result = validatePhoto(pngBytes(800, 600), "image/jpeg");
    expect(result.qualityOk).toBe(false);
    expect(result.qualityReason).toContain("image/png");
  });

  test("rejects a photo below the minimum resolution", () => {
    const result = validatePhoto(jpegBytes(320, 240), "image/jpeg");
    expect(result.qualityOk).toBe(false);
    expect(result.qualityReason).toContain("640×480");
  });

  test("rejects an empty file and unrecognized bytes", () => {
    expect(validatePhoto(new Uint8Array(), "image/png").qualityOk).toBe(false);
    expect(validatePhoto(new Uint8Array([1, 2, 3]), "image/png").qualityOk).toBe(false);
  });
});
