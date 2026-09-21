import { ASSET_CODE_PATTERN } from "./asset-code";

export const MEMO_PREFIX = "hpl:v1";

export type MemoPayload = {
  assetCode: string;
  version: number;
  contentHash: string;
};

export class InvalidMemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMemoError";
  }
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MEMO_PATTERN = /^hpl:v1:(HPL-\d{4}-\d{5}):(\d+):([0-9a-f]{64})$/;

/**
 * Builds the Solana Memo text for a passport anchor.
 *
 * @param payload asset code, version and content hash to commit on-chain
 * @returns the memo text, for example `hpl:v1:HPL-2026-00001:1:<hash>`
 * @throws {InvalidMemoError} when any field is malformed
 */
export function buildMemo(payload: MemoPayload): string {
  if (!ASSET_CODE_PATTERN.test(payload.assetCode)) {
    throw new InvalidMemoError(`Asset code memo tidak valid: ${payload.assetCode}.`);
  }
  if (!Number.isInteger(payload.version) || payload.version < 1) {
    throw new InvalidMemoError(`Versi memo tidak valid: ${payload.version}.`);
  }
  if (!HASH_PATTERN.test(payload.contentHash)) {
    throw new InvalidMemoError("Content hash memo harus berupa 64 karakter heksadesimal huruf kecil.");
  }
  return `${MEMO_PREFIX}:${payload.assetCode}:${payload.version}:${payload.contentHash}`;
}

/**
 * Parses Solana Memo text back into its payload. Never throws.
 *
 * @param text memo text read from a transaction
 * @returns the parsed payload, or `null` when the text is not a well-formed `hpl:v1` memo
 */
export function parseMemo(text: string): MemoPayload | null {
  const match = MEMO_PATTERN.exec(text);
  if (!match) return null;
  const [, assetCode, versionText, contentHash] = match;
  if (!assetCode || !versionText || !contentHash) return null;
  const version = Number(versionText);
  if (version < 1) return null;
  return { assetCode, version, contentHash };
}
