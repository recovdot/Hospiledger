import { TRPCError } from "@trpc/server";

import type { DbHandle } from "../db";

/**
 * Loads an asset that belongs to the caller's company.
 *
 * @param db database or transaction handle
 * @param input owning company and asset id
 * @returns the asset row
 * @throws {TRPCError} `NOT_FOUND` when the asset is missing or owned by another company
 */
export async function loadOwnedAsset(db: DbHandle, input: { companyId: string; assetId: string }) {
  const asset = await db.query.assets.findFirst({ where: { id: input.assetId, companyId: input.companyId } });
  if (!asset) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Aset tidak ditemukan." });
  }
  return asset;
}

/**
 * Loads a passport by Asset ID, scoped to the caller's company. Company scoping is the authorization boundary
 * for every seller procedure.
 *
 * @param db database or transaction handle
 * @param input owning company and the passport Asset ID
 * @returns the passport row with its asset
 * @throws {TRPCError} `NOT_FOUND` when the passport is missing or owned by another company
 */
export async function loadOwnedPassport(db: DbHandle, input: { companyId: string; assetCode: string }) {
  const passport = await db.query.passports.findFirst({
    where: { assetCode: input.assetCode },
    with: { asset: true },
  });
  if (!passport || passport.asset.companyId !== input.companyId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  return passport;
}
