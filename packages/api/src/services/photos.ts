import { assetPhotos, backendJobs, passports, photoUploadReservations, type Database } from "@hospiledger/db";
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
import { and, count, eq, isNull, lt, lte } from "drizzle-orm";

import type { DbHandle } from "../db";
import { enqueueBackendJob, retryBackendJob, type JobLease } from "../jobs/runner";
import { validatePhoto } from "../lib/image";
import type { Logger } from "../logger";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { loadOwnedAsset } from "./ownership";

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
const CONFIRM_WINDOW_MS = 15 * 60 * 1000;
// Supabase signed upload tokens remain valid for two hours, even after server confirmation expires.
const UPLOAD_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
const CLEANUP_SAFETY_MS = 60 * 1000;

/** Locks the passport before evidence changes, matching inspection's eligibility lock.
 * @param db database or transaction handle
 * @param assetId asset owning the passport
 * @returns locked passport row
 */
export async function lockPhotoPassport(db: DbHandle, assetId: string) {
  const [passport] = await db.select().from(passports).where(eq(passports.assetId, assetId)).for("update").limit(1);
  if (!passport) throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  return passport;
}

function assertPhotosEditable(status: string): void {
  if (!EDITABLE_PASSPORT_STATUSES.includes(status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Foto hanya bisa diubah sebelum hasil inspeksi dikirim untuk ditinjau.",
    });
  }
}

async function enqueuePhotoDeletion(db: DbHandle, storagePath: string): Promise<void> {
  await enqueueBackendJob(db, "delete_photo", storagePath);
  const [reservation] = await db.select({ createdAt: photoUploadReservations.createdAt })
    .from(photoUploadReservations).where(eq(photoUploadReservations.storagePath, storagePath)).limit(1);
  if (reservation) {
    const safeAfter = new Date(reservation.createdAt.getTime() + UPLOAD_TOKEN_LIFETIME_MS + CLEANUP_SAFETY_MS);
    await db.update(backendJobs).set({ runAfter: safeAfter })
      .where(and(eq(backendJobs.kind, "delete_photo"), eq(backendJobs.targetId, storagePath), eq(backendJobs.status, "pending")));
  }
}

/** Signs short-lived read URLs for stored photos.
 * @param storage private photo storage adapter
 * @param photos stored evidence rows
 * @returns evidence rows with signed read URLs
 */
export async function signPhotoUrls(storage: AssetPhotoStorage, photos: AssetPhoto[]): Promise<AssetPhotoWithUrl[]> {
  return Promise.all(photos.map(async (photo) => ({ ...photo, signedUrl: await storage.createReadUrl(photo.storagePath) })));
}

/** Reserves one fresh immutable path before issuing its browser upload URL.
 * @param db database handle
 * @param storage private photo storage adapter
 * @param input owned asset and requested upload details
 * @returns reserved path, signed URL and token
 */
export async function createPhotoUploadUrl(
  db: DbHandle,
  storage: AssetPhotoStorage,
  input: PhotosCreateUploadUrlInput & { companyId: string },
): Promise<PhotosCreateUploadUrlOutput> {
  const storagePath = await db.transaction(async (tx) => {
    await loadOwnedAsset(tx, { companyId: input.companyId, assetId: input.assetId });
    const passport = await lockPhotoPassport(tx, input.assetId);
    assertPhotosEditable(passport.status);
    const [total] = await tx.select({ total: count() }).from(assetPhotos).where(eq(assetPhotos.assetId, input.assetId));
    const requiredReplacement = REQUIRED_TYPES.includes(input.type) &&
      !!(await tx.query.assetPhotos.findFirst({ where: { assetId: input.assetId, type: input.type } }));
    if ((total?.total ?? 0) >= MAX_PHOTOS_PER_ASSET && !requiredReplacement) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Maksimal ${MAX_PHOTOS_PER_ASSET} foto per aset. Hapus foto lama sebelum menambah.` });
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];
    const storagePath = `${input.companyId}/${input.assetId}/${input.type}-immutable-${crypto.randomUUID()}.${extension}`;
    await tx.insert(photoUploadReservations).values({
      assetId: input.assetId,
      type: input.type,
      mimeType: input.contentType,
      storagePath,
      expiresAt: new Date(Date.now() + CONFIRM_WINDOW_MS),
    });
    return storagePath;
  });
  const { signedUrl, token } = await storage.createUploadUrl(storagePath);
  return { storagePath, signedUrl, token };
}

/** Validates issued path and bytes, then replaces the required slot and consumes the reservation.
 * @param db database handle
 * @param storage private photo storage adapter
 * @param input owned asset, issued type and path
 * @returns persisted evidence row
 */
export async function confirmPhotoUpload(
  db: DbHandle,
  storage: AssetPhotoStorage,
  input: PhotosConfirmUploadInput & { companyId: string },
): Promise<AssetPhoto> {
  await loadOwnedAsset(db, { companyId: input.companyId, assetId: input.assetId });
  const [issued] = await db.select().from(photoUploadReservations).where(and(
    eq(photoUploadReservations.assetId, input.assetId),
    eq(photoUploadReservations.type, input.type),
    eq(photoUploadReservations.storagePath, input.storagePath),
    isNull(photoUploadReservations.consumedAt),
  )).limit(1);
  if (!issued || issued.expiresAt <= new Date()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Izin unggah foto tidak cocok atau sudah kedaluwarsa. Unggah ulang foto." });
  }
  const bytes = await storage.readObject(issued.storagePath);
  if (!bytes) throw new TRPCError({ code: "BAD_REQUEST", message: "Berkas foto belum diunggah. Coba unggah ulang." });
  const validation = await validatePhoto(bytes, issued.mimeType as PhotoContentType);
  const fileSha256 = sha256HexOfBytes(bytes);

  return db.transaction(async (tx) => {
    await loadOwnedAsset(tx, { companyId: input.companyId, assetId: input.assetId });
    const passport = await lockPhotoPassport(tx, input.assetId);
    assertPhotosEditable(passport.status);
    const [reservation] = await tx.select().from(photoUploadReservations).where(eq(photoUploadReservations.id, issued.id)).for("update").limit(1);
    if (!reservation || reservation.consumedAt || reservation.expiresAt <= new Date() ||
      reservation.assetId !== input.assetId || reservation.type !== input.type || reservation.storagePath !== input.storagePath) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Izin unggah foto tidak cocok atau sudah digunakan. Unggah ulang foto." });
    }

    const isRequiredType = REQUIRED_TYPES.includes(input.type);
    const replaced = isRequiredType
      ? await tx.select({ id: assetPhotos.id, storagePath: assetPhotos.storagePath }).from(assetPhotos)
          .where(and(eq(assetPhotos.assetId, input.assetId), eq(assetPhotos.type, input.type)))
      : [];
    const [total] = await tx.select({ total: count() }).from(assetPhotos).where(eq(assetPhotos.assetId, input.assetId));
    if ((total?.total ?? 0) >= MAX_PHOTOS_PER_ASSET && replaced.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Maksimal ${MAX_PHOTOS_PER_ASSET} foto per aset. Hapus foto lama sebelum menambah.` });
    }
    if (replaced.length) await tx.delete(assetPhotos).where(and(eq(assetPhotos.assetId, input.assetId), eq(assetPhotos.type, input.type)));
    const [created] = await tx.insert(assetPhotos).values({
      assetId: input.assetId,
      type: input.type,
      storagePath: reservation.storagePath,
      fileSha256,
      qualityOk: validation.qualityOk,
      qualityReason: validation.qualityReason,
    }).returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal menyimpan foto." });
    await tx.update(photoUploadReservations).set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(eq(photoUploadReservations.id, reservation.id));
    for (const previous of replaced) await enqueuePhotoDeletion(tx, previous.storagePath);
    return created;
  });
}

/** Enqueues expired, unconsumed objects after the upload token stops working.
 * @param db database handle
 * @param now current time for the sweep
 * @returns number of expired reservations considered
 */
export async function sweepExpiredPhotoReservations(db: DbHandle, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UPLOAD_TOKEN_LIFETIME_MS - CLEANUP_SAFETY_MS);
  const expired = await db.select({ storagePath: photoUploadReservations.storagePath }).from(photoUploadReservations)
    .where(and(isNull(photoUploadReservations.consumedAt), lt(photoUploadReservations.createdAt, cutoff)));
  for (const reservation of expired) await enqueueBackendJob(db, "delete_photo", reservation.storagePath);
  return expired.length;
}

/** Requeues cooled-down failed photo deletions after transient storage failures.
 * @param db database handle
 * @param now current time for the sweep
 * @returns number of failed deletions considered
 */
export async function retryFailedPhotoDeletions(db: DbHandle, now = new Date()): Promise<number> {
  const cooldown = new Date(now.getTime() - 15 * 60 * 1000);
  const failed = await db.select({ storagePath: backendJobs.targetId }).from(backendJobs)
    .where(and(
      eq(backendJobs.kind, "delete_photo"),
      eq(backendJobs.status, "failed"),
      lte(backendJobs.updatedAt, cooldown),
    ));
  for (const deletion of failed) await retryBackendJob(db, "delete_photo", deletion.storagePath);
  return failed.length;
}

/** Deletes an unreferenced object outside SQL, guarded against stale workers and live evidence.
 * @param deps database, storage and logger
 * @param storagePath object path to clean
 * @param lease current job lease
 * @returns when cleanup is complete
 */
export async function runDeletePhoto(
  deps: { db: Database; storage: AssetPhotoStorage; logger: Logger },
  storagePath: string,
  lease: JobLease,
): Promise<void> {
  const [referenced] = await deps.db.select({ id: assetPhotos.id }).from(assetPhotos)
    .where(eq(assetPhotos.storagePath, storagePath)).limit(1);
  if (referenced) return;
  const [reservation] = await deps.db.select().from(photoUploadReservations)
    .where(eq(photoUploadReservations.storagePath, storagePath)).limit(1);
  if (reservation && reservation.createdAt.getTime() + UPLOAD_TOKEN_LIFETIME_MS + CLEANUP_SAFETY_MS > Date.now()) {
    throw new Error("Photo upload token is not yet expired.");
  }
  await deps.storage.removeObject(storagePath);
  await deps.db.transaction(async (tx) => {
    await lease.assertCurrent(tx);
    const [active] = await tx.select({ id: assetPhotos.id }).from(assetPhotos)
      .where(eq(assetPhotos.storagePath, storagePath)).limit(1);
    if (active) throw new Error("Photo became referenced during cleanup.");
    await tx.delete(photoUploadReservations).where(eq(photoUploadReservations.storagePath, storagePath));
  });
  deps.logger.info("Foto lama dibersihkan dari penyimpanan.", { storagePath });
}

/** Audits a legacy photo and copies verified bytes to a non-upsert path without changing its hash.
 * @param db database handle
 * @param storage private photo storage adapter
 * @param photoId existing evidence row
 * @returns repair outcome or mismatch
 */
export async function repairLegacyPhoto(
  db: Database,
  storage: AssetPhotoStorage,
  photoId: string,
): Promise<"repaired" | "mismatch" | "unreachable" | "already_immutable"> {
  const [photo] = await db.select().from(assetPhotos).where(eq(assetPhotos.id, photoId)).limit(1);
  if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "Foto tidak ditemukan." });
  if (photo.storagePath.includes("-immutable-")) return "already_immutable";
  if (photo.createdAt.getTime() + UPLOAD_TOKEN_LIFETIME_MS + CLEANUP_SAFETY_MS > Date.now()) return "unreachable";
  const bytes = await storage.readObject(photo.storagePath);
  if (!bytes) return "mismatch";
  if (sha256HexOfBytes(bytes) !== photo.fileSha256) return "mismatch";
  const contentType = CONTENT_TYPE_BY_EXTENSION[photo.storagePath.split(".").pop() ?? ""];
  if (!contentType) return "mismatch";
  const prefix = photo.storagePath.slice(0, photo.storagePath.lastIndexOf("/") + 1);
  const immutablePath = `${prefix}${photo.type}-immutable-${crypto.randomUUID()}.${EXTENSION_BY_CONTENT_TYPE[contentType]}`;
  const [copyReservation] = await db.insert(photoUploadReservations).values({
    assetId: photo.assetId,
    type: photo.type,
    mimeType: contentType,
    storagePath: immutablePath,
    expiresAt: new Date(Date.now() + CONFIRM_WINDOW_MS),
  }).returning({ id: photoUploadReservations.id });
  if (!copyReservation) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal mencatat salinan foto." });
  await storage.uploadObject(immutablePath, bytes, contentType);
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(assetPhotos).where(eq(assetPhotos.id, photo.id)).for("update").limit(1);
    if (!locked || locked.storagePath !== photo.storagePath || locked.fileSha256 !== photo.fileSha256) {
      throw new TRPCError({ code: "CONFLICT", message: "Foto berubah saat diperiksa; ulangi audit." });
    }
    await tx.update(assetPhotos).set({ storagePath: immutablePath, updatedAt: new Date() }).where(eq(assetPhotos.id, photo.id));
    await tx.update(photoUploadReservations).set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(eq(photoUploadReservations.id, copyReservation.id));
    await enqueuePhotoDeletion(tx, photo.storagePath);
  });
  return "repaired";
}

/** Lists stored photos ordered by their required display slot.
 * @param db database or transaction handle
 * @param assetId asset whose evidence is loaded
 * @returns sorted evidence rows
 */
export async function loadAssetPhotos(db: DbHandle, assetId: string): Promise<AssetPhoto[]> {
  const photos = await db.select().from(assetPhotos).where(eq(assetPhotos.assetId, assetId));
  return photos.sort((left, right) => PHOTO_TYPES.indexOf(left.type) - PHOTO_TYPES.indexOf(right.type));
}

/** Reports required photo slots still missing or rejected.
 * @param photos stored evidence
 * @returns missing or rejected slot explanations
 */
export function findMissingRequiredPhotos(photos: AssetPhoto[]): { type: PhotoType; reason: string }[] {
  return REQUIRED_PHOTO_TYPES.flatMap((type) => {
    const stored = photos.find((photo) => photo.type === type);
    if (stored?.qualityOk) return [];
    return [{ type, reason: stored?.qualityReason ?? `Foto ${type} belum diunggah.` }];
  });
}
