import { aiInspections, assetPhotos, assets, companies, passports, sellerReviews } from "@hospiledger/db";
import { PHOTO_TYPES } from "@hospiledger/shared";
import type {
  PublicPassportsGetByCodeOutput,
  PublicPassportsListOutput,
  PublicPassportsVerifyOutput,
} from "@hospiledger/shared";
import { sha256HexOfBytes } from "@hospiledger/shared/hashing";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import type { ChainClient } from "../chain/types";
import type { DbHandle } from "../db";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { checkEvidenceBytes, foldSellerReviews, loadLatestChainRecord, loadOrderedSellerReviews, projectApprovedPassport, verifyPassportAnchor } from "./integrity";
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
  const inspection = passport.inspectionId
    ? (await db.select().from(aiInspections).where(eq(aiInspections.id, passport.inspectionId)).limit(1))[0]
    : null;
  const record = await loadLatestChainRecord(db, passport.id);
  const chainAnchor = toChainAnchor(record);
  if (!record || !chainAnchor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  const verification = await verifyPassportAnchor(db, storage, chain, passport, record, new Date());
  const evidenceIsIntact = verification.result === "match" || await checkEvidenceBytes(db, storage, passport.id) === "match";
  const photos = evidenceIsIntact
    ? await signPhotoUrls(storage, (await loadAssetPhotos(db, passport.assetId)).filter((photo) => photo.qualityOk))
    : [];
  const { sellerEdits, sellerNotes } = foldSellerReviews(await loadOrderedSellerReviews(db, passport.id));
  const projected = projectApprovedPassport({ asset: passport.asset, inspection: inspection ?? null, sellerEdits });
  const [company] = await db.select({ name: companies.name }).from(companies)
    .where(eq(companies.id, passport.asset.companyId)).limit(1);

  return {
    passport: {
      assetCode: passport.assetCode,
      ...projected,
      valueEstimate: inspection?.valueEstimate ?? null,
      valueMin: inspection?.valueMin ?? null,
      valueMax: inspection?.valueMax ?? null,
      photos: photos
        .map((photo) => ({ type: photo.type, signedUrl: photo.signedUrl }))
        .sort((left, right) => PHOTO_TYPES.indexOf(left.type) - PHOTO_TYPES.indexOf(right.type)),
      publishedAt: passport.publishedAt ?? passport.createdAt,
      sellerEdits,
      sellerNotes,
      sellerCompanyName: company?.name ?? null,
      chain: chainAnchor,
      verification,
    },
  };
}

/**
 * Recomputes the content hash of a published passport and compares it with the on-chain memo.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage used to check accepted evidence bytes
 * @param chain chain client used to read the memo
 * @param input the passport Asset ID
 * @returns the verification result, one of `match`, `mismatch`, `pending`, `not_found`, or `unreachable`
 * @throws {TRPCError} `NOT_FOUND` when no published passport carries that Asset ID
 */
export async function verifyPublicPassport(
  db: DbHandle,
  storage: AssetPhotoStorage,
  chain: ChainClient,
  input: { assetCode: string },
): Promise<PublicPassportsVerifyOutput> {
  const passport = await loadPublishedPassport(db, input.assetCode);
  const record = await loadLatestChainRecord(db, passport.id);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  const verification = await verifyPassportAnchor(db, storage, chain, passport, record, new Date());
  return { verification };
}

/**
 * Searches published passports by category, brand or model, newest first.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage, used to sign one cover photo per result
 * @param input optional text query, category filter, and page limit/offset
 * @returns the matching page of public passport summaries
 */
export async function listPublicPassports(
  db: DbHandle,
  storage: AssetPhotoStorage,
  input: { q?: string; category?: string; limit: number; offset: number },
): Promise<PublicPassportsListOutput> {
  const pattern = input.q ? `%${input.q}%` : null;
  const conditions = [eq(passports.status, "published")];
  if (input.category) conditions.push(eq(assets.category, input.category));
  if (pattern) {
    conditions.push(
      or(ilike(assets.category, pattern), ilike(assets.brand, pattern), ilike(assets.model, pattern))!,
    );
  }

  const rows = await db
    .select({
      passportId: passports.id,
      assetCode: passports.assetCode,
      assetId: assets.id,
      category: assets.category,
      brand: assets.brand,
      model: assets.model,
      serialNumber: assets.serialNumber,
      year: assets.year,
      capacity: assets.capacity,
      location: assets.location,
      previousUsage: assets.previousUsage,
      inspectionId: passports.inspectionId,
      publishedAt: passports.publishedAt,
      createdAt: passports.createdAt,
    })
    .from(passports)
    .innerJoin(assets, eq(passports.assetId, assets.id))
    .where(and(...conditions))
    .orderBy(desc(passports.publishedAt))
    .limit(input.limit)
    .offset(input.offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(passports)
    .innerJoin(assets, eq(passports.assetId, assets.id))
    .where(and(...conditions));

  const assetIds = rows.map((row) => row.assetId);
  const inspectionIds = rows.flatMap((row) => row.inspectionId ? [row.inspectionId] : []);
  const inspections = inspectionIds.length > 0
    ? await db.select().from(aiInspections).where(inArray(aiInspections.id, inspectionIds))
    : [];
  const inspectionById = new Map(inspections.map((inspection) => [inspection.id, inspection]));
  const passportIds = rows.map((row) => row.passportId);
  const reviews = passportIds.length > 0
    ? await db.select().from(sellerReviews).where(inArray(sellerReviews.passportId, passportIds))
      .orderBy(sellerReviews.passportId, sellerReviews.reviewedAt, sellerReviews.createdAt, sellerReviews.id)
    : [];
  const reviewsByPassport = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const existing = reviewsByPassport.get(review.passportId);
    if (existing) existing.push(review);
    else reviewsByPassport.set(review.passportId, [review]);
  }

  const coverPhotos =
    assetIds.length > 0
      ? await db
          .select({ assetId: assetPhotos.assetId, storagePath: assetPhotos.storagePath, fileSha256: assetPhotos.fileSha256 })
          .from(assetPhotos)
          .where(and(inArray(assetPhotos.assetId, assetIds), eq(assetPhotos.type, "front"), eq(assetPhotos.qualityOk, true)))
      : [];
  const coverPhotoByAsset = new Map(coverPhotos.map((photo) => [photo.assetId, photo]));

  const items = await Promise.all(
    rows.map(async (row) => {
      const inspection = row.inspectionId ? inspectionById.get(row.inspectionId) : null;
      const cover = coverPhotoByAsset.get(row.assetId);
      let coverPhotoUrl: string | null = null;
      if (cover) {
        try {
          const bytes = await storage.readObject(cover.storagePath);
          if (bytes && sha256HexOfBytes(bytes) === cover.fileSha256) {
            coverPhotoUrl = await storage.createReadUrl(cover.storagePath);
          }
        } catch {
          // A storage outage cannot authorize an unverified evidence URL.
        }
      }
      const projected = projectApprovedPassport({
        asset: row,
        inspection: inspection ?? null,
        sellerEdits: foldSellerReviews(reviewsByPassport.get(row.passportId) ?? []).sellerEdits,
      });
      return {
        assetCode: row.assetCode,
        category: projected.category,
        brand: projected.brand,
        model: projected.model,
        conditionScore: projected.conditionScore,
        grade: projected.grade,
        valueEstimate: inspection?.valueEstimate ?? null,
        valueMin: inspection?.valueMin ?? null,
        valueMax: inspection?.valueMax ?? null,
        coverPhotoUrl,
        publishedAt: row.publishedAt ?? row.createdAt,
      };
    }),
  );

  return { items, total: totalRow?.total ?? 0 };
}
