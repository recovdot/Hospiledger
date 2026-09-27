import { aiInspections, sellerReviews } from "@hospiledger/db";
import type { ChainAnchor, PassportsGetOutput } from "@hospiledger/shared";
import { desc, eq } from "drizzle-orm";

import type { ChainClient } from "../chain/types";
import type { DbHandle } from "../db";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { loadLatestChainRecord, verifyPassportAnchor } from "./integrity";
import { loadOwnedPassport } from "./ownership";
import { loadAssetPhotos, signPhotoUrls } from "./photos";
import type { PassportRecordRow } from "./rows";

/**
 * Projects a chain record into the wire shape used by passport and public views.
 *
 * @param record latest record for a passport, or `null`
 * @returns the chain anchor, or `null` when the passport has no record
 */
export function toChainAnchor(record: PassportRecordRow | null): ChainAnchor | null {
  if (!record) return null;
  return {
    version: record.version,
    chainStatus: record.chainStatus,
    chainCluster: record.chainCluster,
    txSignature: record.txSignature,
    slot: record.slot,
    anchoredAt: record.anchoredAt,
  };
}

/**
 * Loads one owned passport with photos, AI result, seller reviews, and the anchor verification result.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage
 * @param chain chain client used to verify a confirmed anchor
 * @param input owning company and the passport Asset ID
 * @returns the passport detail payload
 * @throws {TRPCError} `NOT_FOUND` when the passport is missing or owned by another company
 */
export async function loadPassportDetail(
  db: DbHandle,
  storage: AssetPhotoStorage,
  chain: ChainClient,
  input: { companyId: string; assetCode: string },
): Promise<PassportsGetOutput> {
  const passport = await loadOwnedPassport(db, input);
  const photos = await signPhotoUrls(storage, await loadAssetPhotos(db, passport.assetId));
  const inspection = passport.inspectionId
    ? (await db.select().from(aiInspections).where(eq(aiInspections.id, passport.inspectionId)).limit(1))[0]
    : null;
  const reviews = await db
    .select()
    .from(sellerReviews)
    .where(eq(sellerReviews.passportId, passport.id))
    .orderBy(desc(sellerReviews.reviewedAt));
  const record = await loadLatestChainRecord(db, passport.id);
  const verification =
    record?.chainStatus === "confirmed"
      ? await verifyPassportAnchor(db, storage, chain, passport, record, new Date())
      : null;

  return {
    passport: { ...passport, chain: toChainAnchor(record) },
    asset: passport.asset,
    photos,
    inspection: inspection ?? null,
    reviews,
    verification,
  };
}
