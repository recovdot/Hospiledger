import { assetPhotos } from "@hospiledger/db";
import {
  MAX_PHOTOS_PER_ASSET,
  PHOTO_TYPES,
  REQUIRED_PHOTO_TYPES,
  type AssetPhoto,
  type AssetPhotoWithUrl,
  type PhotoContentType,
  type PhotoType,
  type PhotosConfirmUploadInput,
  type PhotosCreateUploadUrlInput,
  type PhotosCreateUploadUrlOutput,
} from "@hospiledger/shared";
import { sha256HexOfBytes } from "@hospiledger/shared/hashing";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";

import type { DbHandle } from "../db";
import { validatePhoto } from "../lib/image";
import { loadOwnedAsset } from "./ownership";
import type { AssetPhotoStorage } from "../storage/asset-photos";

const EXTENSION_BY_CONTENT_TYPE: Record<PhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, PhotoContentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EDITABLE_PASSPORT_STATUSES: readonly string[] = ["draft", "ai_failed"];
const REQUIRED_TYPES: readonly PhotoType[] = REQUIRED_PHOTO_TYPES;

async function assertPhotosEditable(db: DbHandle, assetId: string) {
  const passport = await db.query.passports.findFirst({ where: { assetId }, columns: { status: true } });
  if (!passport) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  if (!EDITABLE_PASSPORT_STATUSES.includes(passport.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Foto hanya bisa diubah sebelum hasil inspeksi dikirim untuk ditinjau.",
    });
  }
}

/**
 * Signs short-lived read URLs for stored photos.
 *
 * @param storage asset photo storage
 * @param photos stored photo rows
 * @returns the rows with a `signedUrl` for each photo
 */
export async function signPhotoUrls(storage: AssetPhotoStorage, photos: AssetPhoto[]): Promise<AssetPhotoWithUrl[]> {
  return Promise.all(
    photos.map(async (photo) => ({ ...photo, signedUrl: await storage.createReadUrl(photo.storagePath) })),
  );
}

/**
 * Reserves a private storage path and returns the browser's signed upload URL.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage
 * @param input owning company plus the asset, photo type, content type and file size
 * @returns the storage path, the signed upload URL and its token
 * @throws {TRPCError} `NOT_FOUND` for a foreign asset, `BAD_REQUEST` when the photo budget is exhausted or the asset is past draft
 */
export async function createPhotoUploadUrl(
  db: DbHandle,
  storage: AssetPhotoStorage,
  input: PhotosCreateUploadUrlInput & { companyId: string },
): Promise<PhotosCreateUploadUrlOutput> {
  await loadOwnedAsset(db, { companyId: input.companyId, assetId: input.assetId });
  await assertPhotosEditable(db, input.assetId);

  const [total] = await db.select({ total: count() }).from(assetPhotos).where(eq(assetPhotos.assetId, input.assetId));
  if ((total?.total ?? 0) >= MAX_PHOTOS_PER_ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Maksimal ${MAX_PHOTOS_PER_ASSET} foto per aset. Hapus foto lama sebelum menambah.`,
    });
  }

  const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];
  const storagePath = `${input.companyId}/${input.assetId}/${input.type}-${crypto.randomUUID()}.${extension}`;
  const { signedUrl, token } = await storage.createUploadUrl(storagePath);
  return { storagePath, signedUrl, token };
}

/**
 * Verifies an uploaded photo, records its SHA-256 file hash, and stores it as evidence.
 * A required photo type holds exactly one photo, so confirming a new one replaces the previous row and object.
 * A photo that fails validation is stored flagged with the reason the seller must fix.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage
 * @param input owning company plus the confirmed asset, photo type and storage path
 * @returns the stored photo row
 * @throws {TRPCError} `NOT_FOUND` for a foreign asset, `BAD_REQUEST` for a foreign path, a missing object or a full budget
 */
export async function confirmPhotoUpload(
  db: DbHandle,
  storage: AssetPhotoStorage,
  input: PhotosConfirmUploadInput & { companyId: string },
): Promise<AssetPhoto> {
  await loadOwnedAsset(db, { companyId: input.companyId, assetId: input.assetId });
  await assertPhotosEditable(db, input.assetId);

  if (!input.storagePath.startsWith(`${input.companyId}/${input.assetId}/`)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Lokasi berkas foto tidak sesuai dengan aset." });
  }
  const declaredContentType = CONTENT_TYPE_BY_EXTENSION[input.storagePath.split(".").pop() ?? ""];
  if (!declaredContentType) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Lokasi berkas foto tidak dikenali." });
  }

  const bytes = await storage.readObject(input.storagePath);
  if (!bytes) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Berkas foto belum diunggah. Coba unggah ulang." });
  }
  const validation = validatePhoto(bytes, declaredContentType);
  const fileSha256 = sha256HexOfBytes(bytes);

  return db.transaction(async (tx) => {
    const isRequiredType = REQUIRED_TYPES.includes(input.type);
    const replaced = isRequiredType
      ? await tx
          .select({ id: assetPhotos.id, storagePath: assetPhotos.storagePath })
          .from(assetPhotos)
          .where(and(eq(assetPhotos.assetId, input.assetId), eq(assetPhotos.type, input.type)))
      : [];

    if (!isRequiredType) {
      const [total] = await tx.select({ total: count() }).from(assetPhotos).where(eq(assetPhotos.assetId, input.assetId));
      if ((total?.total ?? 0) >= MAX_PHOTOS_PER_ASSET) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maksimal ${MAX_PHOTOS_PER_ASSET} foto per aset. Hapus foto lama sebelum menambah.`,
        });
      }
    }
    if (replaced.length > 0) {
      await tx.delete(assetPhotos).where(and(eq(assetPhotos.assetId, input.assetId), eq(assetPhotos.type, input.type)));
    }

    const [created] = await tx
      .insert(assetPhotos)
      .values({
        assetId: input.assetId,
        type: input.type,
        storagePath: input.storagePath,
        fileSha256,
        qualityOk: validation.qualityOk,
        qualityReason: validation.qualityReason,
      })
      .returning();
    if (!created) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal menyimpan foto." });
    }
    for (const previous of replaced) {
      if (previous.storagePath !== input.storagePath) await storage.removeObject(previous.storagePath);
    }
    return created;
  });
}

/**
 * Lists every stored photo of an asset, ordered by photo type.
 *
 * @param db database or transaction handle
 * @param assetId asset whose photos are listed
 * @returns stored photo rows
 */
export async function loadAssetPhotos(db: DbHandle, assetId: string): Promise<AssetPhoto[]> {
  const photos = await db.select().from(assetPhotos).where(eq(assetPhotos.assetId, assetId));
  return photos.sort((left, right) => PHOTO_TYPES.indexOf(left.type) - PHOTO_TYPES.indexOf(right.type));
}

/**
 * Reports the required photo types that are still missing or rejected, with the reason to show the seller.
 *
 * @param photos stored photo rows of the asset
 * @returns one entry per required type that has no accepted photo
 */
export function findMissingRequiredPhotos(photos: AssetPhoto[]): { type: PhotoType; reason: string }[] {
  return REQUIRED_PHOTO_TYPES.flatMap((type) => {
    const stored = photos.find((photo) => photo.type === type);
    if (stored?.qualityOk) return [];
    return [{ type, reason: stored?.qualityReason ?? `Foto ${type} belum diunggah.` }];
  });
}
