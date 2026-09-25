import { aiInspections, assetPhotos, assets, passports } from "@hospiledger/db";
import { PHOTO_TYPES } from "@hospiledger/shared";
import type {
  PublicPassportsGetByCodeOutput,
  PublicPassportsListOutput,
  PublicPassportsVerifyOutput,
} from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

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

/** Reduces rows to the newest one per `assetId`, given rows already ordered newest-first. */
export function latestByAssetId<T extends { assetId: string }>(rows: readonly T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (!latest.has(row.assetId)) latest.set(row.assetId, row);
  }
  return latest;
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
      assetCode: passports.assetCode,
      assetId: assets.id,
      category: assets.category,
      brand: assets.brand,
      model: assets.model,
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
  const inspections =
    assetIds.length > 0
      ? await db.select().from(aiInspections).where(inArray(aiInspections.assetId, assetIds)).orderBy(desc(aiInspections.createdAt))
      : [];
  const latestInspectionByAsset = latestByAssetId(inspections);

  const coverPhotos =
    assetIds.length > 0
      ? await db
          .select({ assetId: assetPhotos.assetId, storagePath: assetPhotos.storagePath })
          .from(assetPhotos)
          .where(and(inArray(assetPhotos.assetId, assetIds), eq(assetPhotos.type, "front"), eq(assetPhotos.qualityOk, true)))
      : [];
  const coverPhotoByAsset = new Map(coverPhotos.map((photo) => [photo.assetId, photo.storagePath]));

  const items = await Promise.all(
    rows.map(async (row) => {
      const inspection = latestInspectionByAsset.get(row.assetId);
      const coverPath = coverPhotoByAsset.get(row.assetId);
      return {
        assetCode: row.assetCode,
        category: row.category,
        brand: row.brand,
        model: row.model,
        conditionScore: inspection?.conditionScore ?? null,
        grade: inspection?.grade ?? null,
        valueEstimate: inspection?.valueEstimate ?? null,
        valueMin: inspection?.valueMin ?? null,
        valueMax: inspection?.valueMax ?? null,
        coverPhotoUrl: coverPath ? await storage.createReadUrl(coverPath) : null,
        publishedAt: row.publishedAt ?? row.createdAt,
      };
    }),
  );

  return { items, total: totalRow?.total ?? 0 };
}
