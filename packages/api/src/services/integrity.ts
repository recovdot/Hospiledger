import { assetPhotos, aiInspections, sellerReviews } from "@hospiledger/db";
import type { AnchorVerification } from "@hospiledger/shared";
import { hashPassportContent, type PassportContent } from "@hospiledger/shared/passport-content";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";

import type { ChainClient } from "../chain/types";
import { toAnchorVerification } from "../chain/verification";
import type { DbHandle } from "../db";

const EMPTY_OCR = { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null };

/**
 * Loads the latest chain anchoring record for a passport, or `null` when it has never been published.
 *
 * @param db database or transaction handle
 * @param passportId passport to look up
 * @returns the highest-version record, or `null`
 */
export async function loadLatestChainRecord(db: DbHandle, passportId: string) {
  const rows = await db.query.passportRecords.findMany({
    where: { passportId },
    orderBy: { version: "desc" },
    limit: 1,
  });
  return rows[0] ?? null;
}

/**
 * Rebuilds the hashed passport content from stored rows: asset fields, the approved inspection values,
 * every seller edit merged in order, seller notes, and the file hash of each accepted evidence photo.
 *
 * @param db database or transaction handle
 * @param passportId passport whose content is rebuilt
 * @param version version of the content being hashed
 * @returns the canonical passport content
 * @throws {TRPCError} `NOT_FOUND` when the passport is missing, `BAD_REQUEST` when it has no completed inspection
 */
export async function buildPassportContent(db: DbHandle, passportId: string, version: number): Promise<PassportContent> {
  const passport = await db.query.passports.findFirst({
    where: { id: passportId },
    with: { asset: true },
  });
  if (!passport) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  if (!passport.inspectionId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Passport belum punya hasil inspeksi AI." });
  }
  const [inspection] = await db.select().from(aiInspections).where(eq(aiInspections.id, passport.inspectionId)).limit(1);
  if (!inspection) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Hasil inspeksi AI tidak ditemukan." });
  }
  const evidence = await db
    .select({ type: assetPhotos.type, fileSha256: assetPhotos.fileSha256 })
    .from(assetPhotos)
    .where(and(eq(assetPhotos.assetId, passport.assetId), eq(assetPhotos.qualityOk, true)));
  const reviews = await db
    .select({ edits: sellerReviews.edits, notes: sellerReviews.notes })
    .from(sellerReviews)
    .where(eq(sellerReviews.passportId, passport.id))
    .orderBy(asc(sellerReviews.reviewedAt), asc(sellerReviews.createdAt), asc(sellerReviews.id));

  const sellerEdits: Record<string, unknown> = {};
  let sellerNotes: string | null = null;
  for (const review of reviews) {
    if (review.edits) Object.assign(sellerEdits, review.edits);
    if (review.notes && review.notes.trim().length > 0) sellerNotes = review.notes;
  }

  return {
    assetCode: passport.assetCode,
    version,
    asset: {
      category: passport.asset.category,
      brand: passport.asset.brand,
      model: passport.asset.model,
      serialNumber: passport.asset.serialNumber,
      year: passport.asset.year,
      capacity: passport.asset.capacity,
      location: passport.asset.location,
      previousUsage: passport.asset.previousUsage,
    },
    inspection: {
      detectedBrand: inspection.detectedBrand,
      detectedModel: inspection.detectedModel,
      confidence: inspection.confidence,
      ocr: inspection.ocrResult ?? EMPTY_OCR,
      damage: inspection.damageResult ?? [],
      damageSeverity: inspection.damageSeverity,
      conditionScore: inspection.conditionScore,
      grade: inspection.grade,
      valueEstimate: inspection.valueEstimate,
      valueMin: inspection.valueMin,
      valueMax: inspection.valueMax,
    },
    sellerEdits: Object.keys(sellerEdits).length > 0 ? sellerEdits : null,
    sellerNotes,
    photos: evidence.map((photo) => ({ type: photo.type, fileSha256: photo.fileSha256 })),
  };
}

/**
 * Recomputes the SHA-256 content hash for a passport version.
 *
 * @param db database or transaction handle
 * @param passportId passport whose content is hashed
 * @param version version being hashed
 * @returns the lowercase hex content hash
 */
export async function computeContentHash(db: DbHandle, passportId: string, version: number): Promise<string> {
  return hashPassportContent(await buildPassportContent(db, passportId, version));
}

/**
 * Verifies a passport version against its on-chain memo.
 *
 * @param db database or transaction handle
 * @param chain chain client used to read the memo
 * @param passport passport identity to verify
 * @param version anchored version to verify
 * @param checkedAt timestamp recorded on the result
 * @returns the verification result; RPC failure yields `unreachable`, never `match`
 */
export async function verifyPassportAnchor(
  db: DbHandle,
  chain: ChainClient,
  passport: { id: string; assetCode: string },
  version: number,
  checkedAt: Date,
): Promise<AnchorVerification> {
  const contentHash = await computeContentHash(db, passport.id, version);
  const record = await loadLatestChainRecord(db, passport.id);
  const memoRead = record?.txSignature ? await chain.readMemo(record.txSignature) : null;
  return toAnchorVerification({
    record,
    assetCode: passport.assetCode,
    contentHash,
    memoRead,
    checkedAt,
  });
}
