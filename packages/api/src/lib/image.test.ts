import { describe, expect, test } from "bun:test";
import sharp from "sharp";

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

async function texturedPng(width = 800, height = 600): Promise<Uint8Array> {
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    const value = ((index / 3) * 37) % 256;
    pixels[index] = value;
    pixels[index + 1] = 255 - value;
    pixels[index + 2] = (value * 13) % 256;
  }
  return new Uint8Array(await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer());
}

async function blurredPng(): Promise<Uint8Array> {
  return new Uint8Array(await sharp(await texturedPng()).blur(24).png().toBuffer());
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
  test("accepts a sharp decoded photo that matches the declared type and minimum resolution", async () => {
    await expect(validatePhoto(await texturedPng(), "image/png")).resolves.toEqual({ qualityOk: true, qualityReason: null });
  });

  test("rejects a mismatched content type with a reason the seller can act on", async () => {
    const validation = await validatePhoto(await texturedPng(), "image/jpeg");
    expect(validation.qualityOk).toBe(false);
    expect(validation.qualityReason).toContain("image/png");
  });

  test("rejects a photo below the minimum resolution", async () => {
    const validation = await validatePhoto(jpegBytes(320, 240), "image/jpeg");
    expect(validation.qualityOk).toBe(false);
    expect(validation.qualityReason).toContain("640×480");
  });

  test("rejects an empty file and unrecognized bytes", async () => {
    expect((await validatePhoto(new Uint8Array(), "image/png")).qualityOk).toBe(false);
    expect((await validatePhoto(new Uint8Array([1, 2, 3]), "image/png")).qualityOk).toBe(false);
  });

  test("rejects a decoded image without enough visual detail", async () => {
    const validation = await validatePhoto(await blurredPng(), "image/png");
    expect(validation).toEqual({
      qualityOk: false,
      qualityReason: "Foto terlalu buram atau tidak menampilkan detail. Unggah foto yang lebih jelas.",
    });
  });
});
