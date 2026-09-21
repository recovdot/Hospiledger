import { assetCodeCounters } from "@hospiledger/db";
import { formatAssetCode } from "@hospiledger/shared";
import { sql } from "drizzle-orm";

import type { DbHandle } from "../db";

/**
 * Allocates the next asset code for a year, race-free, through an atomic counter upsert.
 *
 * @param db database or transaction handle
 * @param year four-digit year used in the `HPL-{YYYY}-{NNNNN}` code
 * @returns the newly allocated asset code
 * @throws {Error} when the counter upsert returns no row
 */
export async function assignAssetCode(db: DbHandle, year: number): Promise<string> {
  const [counter] = await db
    .insert(assetCodeCounters)
    .values({ year, lastValue: 1 })
    .onConflictDoUpdate({
      target: assetCodeCounters.year,
      set: { lastValue: sql`${assetCodeCounters.lastValue} + 1`, updatedAt: new Date() },
    })
    .returning({ lastValue: assetCodeCounters.lastValue });
  if (!counter) {
    throw new Error(`Gagal mengalokasikan asset code untuk tahun ${year}.`);
  }
  return formatAssetCode(year, counter.lastValue);
}
