import { z } from "zod";

export const ASSET_CODE_PATTERN = /^HPL-(\d{4})-(\d{5})$/;

export const assetCodeSchema = z.string().regex(ASSET_CODE_PATTERN, "Format Asset ID tidak valid.");

export type AssetCodeParts = { year: number; sequence: number };

/**
 * Formats an asset code as `HPL-{YYYY}-{5-digit sequence}`.
 *
 * @param year four-digit year between 2000 and 9999
 * @param sequence positive sequence between 1 and 99999
 * @returns the formatted asset code, for example `HPL-2026-00001`
 * @throws {RangeError} when the year or sequence is not an integer in range
 */
export function formatAssetCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Tahun asset code tidak valid: ${year}. Harus bilangan bulat 2000-9999.`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99999) {
    throw new RangeError(`Urutan asset code tidak valid: ${sequence}. Harus bilangan bulat 1-99999.`);
  }
  return `HPL-${year}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Parses an asset code back into its year and sequence.
 *
 * @param code candidate asset code
 * @returns the parsed parts, or `null` when the format does not match
 */
export function parseAssetCode(code: string): AssetCodeParts | null {
  const match = ASSET_CODE_PATTERN.exec(code);
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}
