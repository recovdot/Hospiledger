import { assets, aiInspections, passports, type Database } from "@hospiledger/db";
import type { AssetsCreateInput, AssetsCreateOutput, AssetsGetOutput, AssetsListOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { count, desc, eq } from "drizzle-orm";

import type { DbHandle } from "../db";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { assignAssetCode } from "./asset-code";
import { loadLatestChainRecord } from "./integrity";
import { loadOwnedAsset } from "./ownership";
import { toChainAnchor } from "./passports";
import { loadAssetPhotos, signPhotoUrls } from "./photos";

/**
 * Creates an asset, allocates its Asset ID, and opens a draft passport in one transaction.
 *
 * @param db database handle
 * @param input owning company, creating profile, and the equipment fields
 * @returns the created asset and its draft passport
 * @throws {TRPCError} `INTERNAL_SERVER_ERROR` when a row could not be written
 */
export async function createAsset(
  db: Database,
  input: { companyId: string; createdBy: string; fields: AssetsCreateInput },
): Promise<AssetsCreateOutput> {
  return db.transaction(async (tx) => {
    const assetCode = await assignAssetCode(tx, new Date().getUTCFullYear());
    const [asset] = await tx
      .insert(assets)
      .values({
        companyId: input.companyId,
        createdBy: input.createdBy,
        category: input.fields.category,
        brand: input.fields.brand,
        model: input.fields.model,
        serialNumber: input.fields.serialNumber ?? null,
        year: input.fields.year ?? null,
        capacity: input.fields.capacity ?? null,
        location: input.fields.location ?? null,
        previousUsage: input.fields.previousUsage ?? null,
      })
      .returning();
    if (!asset) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal menyimpan aset." });
    }
    const [passport] = await tx.insert(passports).values({ assetCode, assetId: asset.id, status: "draft" }).returning();
    if (!passport) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal membuat passport." });
    }
    return { asset, passport: { ...passport, chain: null } };
  });
}

/**
 * Lists the caller's company assets with their Asset ID and passport status, newest first.
 *
 * @param db database or transaction handle
 * @param input owning company plus page limit and offset
 * @returns the page of assets and the company total
 */
export async function listAssets(
  db: DbHandle,
  input: { companyId: string; limit: number; offset: number },
): Promise<AssetsListOutput> {
  const rows = await db.query.assets.findMany({
    where: { companyId: input.companyId },
    with: { passports: true },
    orderBy: { createdAt: "desc" },
    limit: input.limit,
    offset: input.offset,
  });
  const [total] = await db.select({ total: count() }).from(assets).where(eq(assets.companyId, input.companyId));

  return {
    items: rows.map(({ passports: assetPassports, ...asset }) => {
      const passport = assetPassports[0] ?? null;
      return { asset, assetCode: passport?.assetCode ?? null, passportStatus: passport?.status ?? null };
    }),
    total: total?.total ?? 0,
  };
}

/**
 * Loads one owned asset with signed photo URLs, its passport and chain status, and the latest inspection.
 *
 * @param db database or transaction handle
 * @param storage asset photo storage
 * @param input owning company and asset id
 * @returns the asset detail payload
 * @throws {TRPCError} `NOT_FOUND` when the asset is missing or owned by another company
 */
export async function loadAssetDetail(
  db: DbHandle,
  storage: AssetPhotoStorage,
  input: { companyId: string; assetId: string },
): Promise<AssetsGetOutput> {
  const asset = await loadOwnedAsset(db, input);
  const photos = await signPhotoUrls(storage, await loadAssetPhotos(db, input.assetId));
  const passport = await db.query.passports.findFirst({ where: { assetId: input.assetId } });
  const [inspection] = await db
    .select()
    .from(aiInspections)
    .where(eq(aiInspections.assetId, input.assetId))
    .orderBy(desc(aiInspections.createdAt))
    .limit(1);

  const chainRecord = passport ? await loadLatestChainRecord(db, passport.id) : null;

  return {
    asset,
    photos,
    passport: passport ? { ...passport, chain: toChainAnchor(chainRecord) } : null,
    inspection: inspection ?? null,
  };
}
