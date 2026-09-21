import { aiInspections } from "@hospiledger/db";
import { PHOTO_TYPES } from "@hospiledger/shared";
import type { PublicPassportsGetByCodeOutput, PublicPassportsVerifyOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";

import type { ChainClient } from "../chain/types";
import type { DbHandle } from "../db";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { loadLatestChainRecord, verifyPassportAnchor } from "./integrity";
import { toChainAnchor } from "./passports";
import { loadAssetPhotos, signPhotoUrls } from "./photos";

async function loadPublishedPassport(db: DbHandle, assetCode: string) {
  const passport = await db.query.passports.findFirst({ where: { assetCode }, with: { asset: true } });
  if (!passport || passport.status !== "published") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  return passport;
}

/**
 * Loads the public view of a published passport: identity, condition, damage, value range, evidence photos,
 * the Solana anchor, and a fresh integrity verification. Seller identity is never included.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage
 * @param chain chain client used to verify the anchor
 * @param input the passport Asset ID
 * @returns the public passport payload
 * @throws {TRPCError} `NOT_FOUND` when no published passport carries that Asset ID
 */
export async function getPublicPassport(
  db: DbHandle,
  storage: AssetPhotoStorage,
  chain: ChainClient,
  input: { assetCode: string },
): Promise<PublicPassportsGetByCodeOutput> {
  const passport = await loadPublishedPassport(db, input.assetCode);
  const [inspection] = await db
    .select()
    .from(aiInspections)
    .where(eq(aiInspections.assetId, passport.assetId))
    .orderBy(desc(aiInspections.createdAt))
    .limit(1);
  const evidence = (await loadAssetPhotos(db, passport.assetId)).filter((photo) => photo.qualityOk);
  const photos = await signPhotoUrls(storage, evidence);
  const record = await loadLatestChainRecord(db, passport.id);
  const chainAnchor = toChainAnchor(record);
  if (!record || !chainAnchor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  const verification = await verifyPassportAnchor(db, chain, passport, record.version, new Date());

  return {
    passport: {
      assetCode: passport.assetCode,
      category: passport.asset.category,
      brand: passport.asset.brand,
      model: passport.asset.model,
      serialNumber: passport.asset.serialNumber,
      year: passport.asset.year,
      capacity: passport.asset.capacity,
      location: passport.asset.location,
      conditionScore: inspection?.conditionScore ?? null,
      grade: inspection?.grade ?? null,
      damageSeverity: inspection?.damageSeverity ?? null,
      damage: inspection?.damageResult ?? [],
      valueEstimate: inspection?.valueEstimate ?? null,
      valueMin: inspection?.valueMin ?? null,
      valueMax: inspection?.valueMax ?? null,
      photos: photos
        .map((photo) => ({ type: photo.type, signedUrl: photo.signedUrl }))
        .sort((left, right) => PHOTO_TYPES.indexOf(left.type) - PHOTO_TYPES.indexOf(right.type)),
      publishedAt: passport.publishedAt ?? passport.createdAt,
      chain: chainAnchor,
      verification,
    },
  };
}

/**
 * Recomputes the content hash of a published passport and compares it with the on-chain memo.
 *
 * @param db database or transaction handle
 * @param chain chain client used to read the memo
 * @param input the passport Asset ID
 * @returns the verification result, one of `match`, `mismatch`, `pending`, `not_found`, or `unreachable`
 * @throws {TRPCError} `NOT_FOUND` when no published passport carries that Asset ID
 */
export async function verifyPublicPassport(
  db: DbHandle,
  chain: ChainClient,
  input: { assetCode: string },
): Promise<PublicPassportsVerifyOutput> {
  const passport = await loadPublishedPassport(db, input.assetCode);
  const record = await loadLatestChainRecord(db, passport.id);
  const verification = await verifyPassportAnchor(db, chain, passport, record?.version ?? 1, new Date());
  return { verification };
}
