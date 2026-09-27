import { MAX_PHOTO_BYTES, MIN_PHOTO_HEIGHT, MIN_PHOTO_WIDTH } from "@hospiledger/shared";
import sharp from "sharp";

import type { PhotoContentType } from "@hospiledger/shared";

export type PhotoValidation = {
  qualityOk: boolean;
  qualityReason: string | null;
};

function hasBytes(bytes: Uint8Array, offset: number, count: number): boolean {
  return offset >= 0 && offset + count <= bytes.length;
}

function uint16be(bytes: Uint8Array, offset: number): number | null {
  if (!hasBytes(bytes, offset, 2)) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function dimensionsFromPng(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => bytes[index] === byte)) return null;
  const width = uint16be(bytes, 16) === null ? null : ((bytes[16] ?? 0) << 24) + ((bytes[17] ?? 0) << 16) + ((bytes[18] ?? 0) << 8) + (bytes[19] ?? 0);
  const height = uint16be(bytes, 20) === null ? null : ((bytes[20] ?? 0) << 24) + ((bytes[21] ?? 0) << 16) + ((bytes[22] ?? 0) << 8) + (bytes[23] ?? 0);
  if (width === null || height === null) return null;
  return { width, height };
}

function dimensionsFromJpeg(bytes: Uint8Array): { width: number; height: number } | null | "unknown" {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const segmentLength = uint16be(bytes, offset + 2);
    if (segmentLength === null || segmentLength < 2) return "unknown";
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      const height = uint16be(bytes, offset + 5);
      const width = uint16be(bytes, offset + 7);
      if (width === null || height === null) return "unknown";
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  return "unknown";
}

function dimensionsFromWebp(bytes: Uint8Array): { width: number; height: number } | null {
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (!riff.every((byte, index) => bytes[index] === byte)) return null;
  if (!webp.every((byte, index) => bytes[index + 8] === byte)) return null;
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === "VP8 ") {
    if (!hasBytes(bytes, 26, 4)) return null;
    return {
      width: ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff,
      height: ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (!hasBytes(bytes, 21, 4)) return null;
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    return {
      width: 1 + (b0 | ((b1 & 0x3f) << 8)),
      height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
    };
  }
  if (chunk === "VP8X") {
    if (!hasBytes(bytes, 24, 6)) return null;
    return {
      width: 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)),
      height: 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)),
    };
  }
  return null;
}

/**
 * Reads raster format and pixel dimensions straight from file headers, without decoding pixels.
 *
 * @param bytes raw file bytes
 * @returns the detected content type and dimensions, with `null` fields when the header is unrecognized
 */
export function inspectImageHeader(bytes: Uint8Array): {
  format: PhotoContentType | null;
  width: number | null;
  height: number | null;
} {
  const png = dimensionsFromPng(bytes);
  if (png) return { format: "image/png", width: png.width, height: png.height };

  const webp = dimensionsFromWebp(bytes);
  if (webp) return { format: "image/webp", width: webp.width, height: webp.height };

  const jpeg = dimensionsFromJpeg(bytes);
  if (jpeg === "unknown" || jpeg) {
    return { format: "image/jpeg", width: jpeg === "unknown" ? null : jpeg.width, height: jpeg === "unknown" ? null : jpeg.height };
  }

  return { format: null, width: null, height: null };
}

/**
 * Validates an uploaded photo for format, resolution, and minimum visual detail.
 *
 * @param bytes raw uploaded bytes
 * @param declaredContentType content type the upload URL was issued for
 * @returns whether the photo is acceptable and, when it is not, the reason the seller must act on
 */
export async function validatePhoto(bytes: Uint8Array, declaredContentType: PhotoContentType): Promise<PhotoValidation> {
  if (bytes.length === 0) {
    return { qualityOk: false, qualityReason: "Berkas foto kosong. Unggah ulang foto asli." };
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    return { qualityOk: false, qualityReason: "Ukuran berkas foto melebihi batas. Unggah foto yang lebih kecil." };
  }
  const header = inspectImageHeader(bytes);
  if (!header.format) {
    return { qualityOk: false, qualityReason: "Berkas tidak dikenali sebagai JPEG, PNG, atau WebP." };
  }
  if (header.format !== declaredContentType) {
    return {
      qualityOk: false,
      qualityReason: `Isi berkas ${header.format} tidak cocok dengan tipe ${declaredContentType} yang dikirim.`,
    };
  }
  if (header.width === null || header.height === null) {
    return { qualityOk: false, qualityReason: "Ukuran foto tidak terbaca. Unggah ulang foto asli." };
  }
  if (header.width < MIN_PHOTO_WIDTH || header.height < MIN_PHOTO_HEIGHT) {
    return {
      qualityOk: false,
      qualityReason: `Resolusi foto minimal ${MIN_PHOTO_WIDTH}×${MIN_PHOTO_HEIGHT}. Foto ini ${header.width}×${header.height}.`,
    };
  }

  try {
    const decoded = await sharp(bytes, { limitInputPixels: 24_000_000 })
      .rotate()
      .resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data: grayscale, info } = decoded;
    let laplacianTotal = 0;
    let pixelCount = 0;
    for (let y = 1; y < info.height - 1; y += 1) {
      for (let x = 1; x < info.width - 1; x += 1) {
        const pixel = grayscale[y * info.width + x] ?? 0;
        const laplacian = Math.abs(
          4 * pixel
          - (grayscale[(y - 1) * info.width + x] ?? 0)
          - (grayscale[(y + 1) * info.width + x] ?? 0)
          - (grayscale[y * info.width + x - 1] ?? 0)
          - (grayscale[y * info.width + x + 1] ?? 0),
        );
        laplacianTotal += laplacian;
        pixelCount += 1;
      }
    }
    if (pixelCount === 0 || laplacianTotal / pixelCount < 2) {
      return { qualityOk: false, qualityReason: "Foto terlalu buram atau tidak menampilkan detail. Unggah foto yang lebih jelas." };
    }
  } catch {
    return { qualityOk: false, qualityReason: "Berkas foto tidak dapat dibaca. Unggah JPEG, PNG, atau WebP yang valid." };
  }

  return { qualityOk: true, qualityReason: null };
}
