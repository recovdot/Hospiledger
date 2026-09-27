import { createAssetPhotoStorage } from "@hospiledger/api/storage/asset-photos";
import { repairLegacyPhoto } from "@hospiledger/api/services/photos";
import { createSupabaseAdmin } from "@hospiledger/api/supabase";
import { assetPhotos, createDb } from "@hospiledger/db";
import { MAX_PHOTO_BYTES } from "@hospiledger/shared";
import { sha256HexOfBytes } from "@hospiledger/shared/hashing";

import { ENV } from "./env.server";
import { createLogger } from "./lib/logger";

/**
 * Server-side operator command that audits legacy photo evidence.
 *
 * `audit` lists each pre-`-immutable-` photo with the status of its stored bytes
 * (`matching`, `mismatch`, `unreachable`); `repair` copies verified bytes to a fresh non-upsert
 * path. Discrepancies never merge silently into evidence hashes; exit code 1 flags them so
 * deployment can stop before claiming photo integrity.
 */
async function auditPhotos(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "audit" && mode !== "repair") {
    throw new Error("Usage: bun apps/server/src/photo-audit.ts audit|repair");
  }
  const db = createDb(ENV);
  const storage = createAssetPhotoStorage(createSupabaseAdmin(ENV).storage, createLogger(), MAX_PHOTO_BYTES);
  let discrepancies = 0;
  try {
    const photos = await db.select({
      id: assetPhotos.id,
      storagePath: assetPhotos.storagePath,
      fileSha256: assetPhotos.fileSha256,
      createdAt: assetPhotos.createdAt,
    }).from(assetPhotos);
    for (const photo of photos) {
      if (photo.storagePath.includes("-immutable-")) continue;
      let status: string;
      try {
        const bytes = await storage.readObject(photo.storagePath);
        status = bytes && sha256HexOfBytes(bytes) === photo.fileSha256 ? "matching" : "mismatch";
        if (status === "matching" && mode === "repair") {
          status = await repairLegacyPhoto(db, storage, photo.id);
        }
      } catch {
        status = "unreachable";
      }
      if (status === "mismatch" || status === "unreachable") discrepancies++;
      process.stdout.write(`${JSON.stringify({ photoId: photo.id, storagePath: photo.storagePath, status })}\n`);
    }
  } finally {
    await db.$client.end();
  }
  if (discrepancies > 0) {
    process.exitCode = 1;
    process.stderr.write(`Photo audit found ${discrepancies} discrepancies; do not claim integrity until repaired.\n`);
  }
}

void auditPhotos().catch((error: unknown) => {
  process.stderr.write(`Photo audit failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
