import type { AdminFailedAnchorsOutput } from "@hospiledger/shared";

import type { DbHandle } from "../db";

/**
 * Lists chain records stuck in `failed`, newest first, with their passport and asset for an admin to retry.
 *
 * @param db database or transaction handle
 * @returns failed chain records with the passport and asset they belong to
 */
export async function listFailedAnchorPassports(db: DbHandle): Promise<AdminFailedAnchorsOutput> {
  const records = await db.query.passportRecords.findMany({
    where: { chainStatus: "failed" },
    with: { passport: { with: { asset: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return {
    items: records.map((record) => ({
      recordId: record.id,
      version: record.version,
      updatedAt: record.updatedAt,
      assetCode: record.passport.assetCode,
      category: record.passport.asset.category,
      brand: record.passport.asset.brand,
      model: record.passport.asset.model,
      companyId: record.passport.asset.companyId,
    })),
  };
}
