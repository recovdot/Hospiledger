import { ASSET_PHOTOS_BUCKET, PHOTO_CONTENT_TYPES, SIGNED_URL_TTL_SECONDS } from "@hospiledger/shared";
import { StorageApiError, type SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

import type { Logger } from "../logger";

/** Storage namespace API. The SDK does not export the class name. */
export type StorageNamespace = SupabaseClient["storage"];

/** Per-bucket object API; the SDK does not export `StorageFileApi`. */
export type StorageBucket = ReturnType<StorageNamespace["from"]>;

export type AssetPhotoStorage = {
  /** Creates the private `asset-photos` bucket when it is missing. Idempotent. */
  ensureBucket(): Promise<void>;
  /** Returns a short-lived URL the browser can PUT the photo to. */
  createUploadUrl(storagePath: string): Promise<{ signedUrl: string; token: string }>;
  /** Returns a short-lived URL for reading a stored photo. */
  createReadUrl(storagePath: string): Promise<string>;
  /** Reads stored bytes for hashing and inspection. Returns `null` when the object does not exist. */
  readObject(storagePath: string): Promise<Uint8Array | null>;
  /** Copies verified legacy bytes to a fresh immutable object path. */
  uploadObject(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Deletes a stored photo; missing objects are ignored. */
  removeObject(storagePath: string): Promise<void>;
};

/**
 * Creates the asset photo storage adapter over a service-role Supabase client.
 *
 * @param storage Supabase storage namespace
 * @param logger structured logger for bucket provisioning
 * @param maxPhotoBytes bucket-level size limit in bytes
 * @returns the storage adapter
 */
export function createAssetPhotoStorage(
  storage: StorageNamespace,
  logger: Logger,
  maxPhotoBytes: number,
): AssetPhotoStorage {
  const bucket = storage.from(ASSET_PHOTOS_BUCKET);

  return {
    async ensureBucket() {
      const listed = await storage.listBuckets({ search: ASSET_PHOTOS_BUCKET });
      if (listed.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal memeriksa bucket penyimpanan: ${listed.error.message}`,
        });
      }
      if (listed.data.some((candidate) => candidate.id === ASSET_PHOTOS_BUCKET)) return;

      const created = await storage.createBucket(ASSET_PHOTOS_BUCKET, {
        public: false,
        fileSizeLimit: maxPhotoBytes,
        allowedMimeTypes: [...PHOTO_CONTENT_TYPES],
      });
      if (created.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal membuat bucket penyimpanan: ${created.error.message}`,
        });
      }
      logger.info("Bucket penyimpanan foto dibuat.", { bucket: ASSET_PHOTOS_BUCKET, maxPhotoBytes });
    },

    async createUploadUrl(storagePath) {
      const signed = await bucket.createSignedUploadUrl(storagePath, { upsert: false });
      if (signed.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal membuat URL unggah: ${signed.error.message}`,
        });
      }
      return { signedUrl: signed.data.signedUrl, token: signed.data.token };
    },

    async createReadUrl(storagePath) {
      const signed = await bucket.createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (signed.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal membuat URL foto: ${signed.error.message}`,
        });
      }
      return signed.data.signedUrl;
    },

    async readObject(storagePath) {
      const downloaded = await bucket.download(storagePath);
      if (downloaded.error) {
        if (downloaded.error instanceof StorageApiError && downloaded.error.status === 404) return null;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal membaca berkas foto: ${downloaded.error.message}`,
        });
      }
      return new Uint8Array(await downloaded.data.arrayBuffer());
    },

    async uploadObject(storagePath, bytes, contentType) {
      const uploaded = await bucket.upload(storagePath, bytes, { contentType, upsert: false });
      if (uploaded.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal menyalin foto bukti: ${uploaded.error.message}`,
        });
      }
    },

    async removeObject(storagePath) {
      const removed = await bucket.remove([storagePath]);
      if (removed.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gagal menghapus berkas foto: ${removed.error.message}`,
        });
      }
    },
  };
}
