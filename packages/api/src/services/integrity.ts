import { assetPhotos, aiInspections, sellerReviews } from "@hospiledger/db";
import { sellerCorrectionsSchema, type AnchorVerification } from "@hospiledger/shared";
import { sha256HexOfBytes } from "@hospiledger/shared/hashing";
import { hashPassportContent, type PassportContent } from "@hospiledger/shared/passport-content";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";

import type { ChainClient } from "../chain/types";
import { toAnchorVerification } from "../chain/verification";
import type { DbHandle } from "../db";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import type { PassportRecordRow, SellerReviewRow } from "./rows";
const EMPTY_OCR = { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null };

type ApprovedPassportProjection = {
  category: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  year: number | null;
  capacity: string | null;
  location: string | null;
  previousUsage: string | null;
  conditionScore: number | null;
  grade: string | null;
  damageSeverity: "low" | "medium" | "high" | null;
  damage: Array<{ kind: "scratch" | "rust" | "broken_component" | "dent" | "dirty" | "missing_parts"; severity: "low" | "medium" | "high"; area: string | null; note: string | null }>;
  scoreComponents: { physical: number; visual: number; completeness: number; overall: number; grade: string } | null;
};

const VISIBLE_EDIT_KEYS = ["category", "brand", "model", "serialNumber", "year", "capacity", "location", "previousUsage", "conditionScore", "grade", "damageSeverity", "damage"] as const;

/** Projects immutable source values and valid seller corrections into the claims a recipient can read. */
export function projectApprovedPassport(input: {
  asset: { category: string; brand: string; model: string; serialNumber: string | null; year: number | null; capacity: string | null; location: string | null; previousUsage: string | null };
  inspection: { conditionScore: number | null; grade: string | null; damageSeverity: "low" | "medium" | "high" | null; damageResult: ApprovedPassportProjection["damage"] | null; scoreComponents: ApprovedPassportProjection["scoreComponents"] | null } | null;
  sellerEdits: Record<string, unknown> | null;
}): ApprovedPassportProjection {
  const acceptedEdits: Record<string, unknown> = {};
  for (const key of VISIBLE_EDIT_KEYS) {
    if (!Object.hasOwn(input.sellerEdits ?? {}, key)) continue;
    const parsedEdit = sellerCorrectionsSchema.shape[key].safeParse(input.sellerEdits?.[key]);
    if (parsedEdit.success) acceptedEdits[key] = parsedEdit.data;
  }
  const edits = sellerCorrectionsSchema.parse(acceptedEdits);
  const inspection = input.inspection;

  return {
    category: edits.category ?? input.asset.category,
    brand: edits.brand ?? input.asset.brand,
    model: edits.model ?? input.asset.model,
    serialNumber: edits.serialNumber === undefined ? input.asset.serialNumber : edits.serialNumber,
    year: edits.year === undefined ? input.asset.year : edits.year,
    capacity: edits.capacity === undefined ? input.asset.capacity : edits.capacity,
    location: edits.location === undefined ? input.asset.location : edits.location,
    previousUsage: edits.previousUsage === undefined ? input.asset.previousUsage : edits.previousUsage,
    conditionScore: edits.conditionScore ?? inspection?.conditionScore ?? null,
    grade: edits.grade ?? inspection?.grade ?? null,
    damageSeverity: edits.damageSeverity === undefined ? inspection?.damageSeverity ?? null : edits.damageSeverity,
    damage: edits.damage ?? inspection?.damageResult ?? [],
    scoreComponents: inspection?.scoreComponents ?? null,
  };
}

/** Applies seller corrections in exactly the order included in the canonical passport hash. */
export function foldSellerReviews(reviews: readonly Pick<SellerReviewRow, "edits" | "notes">[]) {
  const sellerEdits: Record<string, unknown> = {};
  let sellerNotes: string | null = null;
  for (const review of reviews) {
    if (review.edits) Object.assign(sellerEdits, review.edits);
    if (review.notes && review.notes.trim().length > 0) sellerNotes = review.notes;
  }
  return { sellerEdits: Object.keys(sellerEdits).length > 0 ? sellerEdits : null, sellerNotes };
}

/** Loads seller decisions in the same stable sequence for hashing and public display. */
export async function loadOrderedSellerReviews(db: DbHandle, passportId: string) {
  return db.select().from(sellerReviews).where(eq(sellerReviews.passportId, passportId))
    .orderBy(asc(sellerReviews.reviewedAt), asc(sellerReviews.createdAt), asc(sellerReviews.id));
}

/** A missing/changed accepted object is a mismatch; a storage read outage is unverifiable. */
export async function checkEvidenceBytes(
  db: DbHandle,
  storage: AssetPhotoStorage,
  passportId: string,
): Promise<"match" | "mismatch" | "unreachable"> {
  const [passport] = await db.query.passports.findMany({ where: { id: passportId }, limit: 1 });
  if (!passport) throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  const evidence = await db.select({ storagePath: assetPhotos.storagePath, fileSha256: assetPhotos.fileSha256 })
    .from(assetPhotos).where(and(eq(assetPhotos.assetId, passport.assetId), eq(assetPhotos.qualityOk, true)));
  for (const photo of evidence) {
    let bytes: Uint8Array | null;
    try {
      bytes = await storage.readObject(photo.storagePath);
    } catch {
      return "unreachable";
    }
    if (bytes === null || sha256HexOfBytes(bytes) !== photo.fileSha256) return "mismatch";
  }
  return "match";
}

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
  const reviews = await loadOrderedSellerReviews(db, passport.id);
  const { sellerEdits, sellerNotes } = foldSellerReviews(reviews);

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
      ...(inspection.scoreComponents ? { scoreComponents: inspection.scoreComponents } : {}),
    },
    sellerEdits,
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
 * Verifies the selected latest anchor and its accepted photo bytes against the canonical snapshot.
 * Historical versions cannot be projected from the current mutable passport and are rejected.
 *
 * @param db database or transaction handle
 * @param storage private evidence storage
 * @param chain chain client used to read the memo
 * @param passport passport identity to verify
 * @param record selected latest chain record
 * @param checkedAt timestamp recorded on the result
 * @returns the verification result; RPC or storage failure yields `unreachable`, never `match`
 */
export async function verifyPassportAnchor(
  db: DbHandle,
  storage: AssetPhotoStorage,
  chain: ChainClient,
  passport: { id: string; assetCode: string },
  record: PassportRecordRow,
  checkedAt: Date,
): Promise<AnchorVerification> {
  const latest = await loadLatestChainRecord(db, passport.id);
  if (!latest || latest.id !== record.id || record.passportId !== passport.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Verifikasi versi historis belum didukung." });
  }
  const contentHash = await computeContentHash(db, passport.id, record.version);
  const evidenceResult = await checkEvidenceBytes(db, storage, passport.id);
  const memoRead = record.txSignature ? await chain.readMemo(record.txSignature) : null;
  const verification = toAnchorVerification({
    record,
    assetCode: passport.assetCode,
    contentHash,
    memoRead,
    checkedAt,
  });
  return evidenceResult === "match" ? verification : { ...verification, result: evidenceResult };
}
