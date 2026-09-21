import { parseMemo } from "@hospiledger/shared";

import type { AnchorVerification, ChainStatus, MemoPayload } from "@hospiledger/shared";

import type { MemoRead } from "./types";

type AnchorVerificationInput = {
  record: {
    chainStatus: ChainStatus;
    txSignature: string | null;
    chainCluster: string | null;
    version: number;
  } | null;
  assetCode: string;
  contentHash: string;
  memoRead: MemoRead | null;
  checkedAt: Date;
};

/**
 * Turns a stored anchor record plus a read of its transaction into a public verification verdict.
 *
 * Pure: no I/O, no clock. The caller decides what `checkedAt` is, so the same inputs always produce
 * the same verdict. A record that was never anchored, or whose read never happened, stays
 * `pending`; anything the chain did not answer is `unreachable` or `not_found`, never `mismatch`.
 *
 * @param input stored record, expected asset code and content hash, memo read and check time
 * @returns the verification verdict, with the parsed memo fields filled in whenever a memo parsed
 */
export function toAnchorVerification(input: AnchorVerificationInput): AnchorVerification {
  const { record } = input;
  const compose = (
    verdict: AnchorVerification["result"],
    memo: MemoPayload | null,
  ): AnchorVerification => ({
    result: verdict,
    txSignature: record?.txSignature ?? null,
    chainCluster: record?.chainCluster ?? null,
    memoAssetCode: memo?.assetCode ?? null,
    memoVersion: memo?.version ?? null,
    memoContentHash: memo?.contentHash ?? null,
    recomputedContentHash: input.contentHash,
    checkedAt: input.checkedAt,
  });

  if (record === null || record.chainStatus !== "confirmed" || record.txSignature === null) {
    return compose("pending", null);
  }
  const { memoRead } = input;
  if (memoRead === null) return compose("pending", null);
  if (memoRead.kind === "unreachable") return compose("unreachable", null);
  if (memoRead.kind === "pending") return compose("pending", null);
  if (memoRead.kind === "not_found") return compose("not_found", null);
  if (memoRead.errored) return compose("not_found", null);

  const memo = memoRead.memoText === null ? null : parseMemo(memoRead.memoText);
  if (memo === null) return compose("mismatch", null);
  const anchored =
    memo.assetCode === input.assetCode &&
    memo.version === record.version &&
    memo.contentHash === input.contentHash;
  return compose(anchored ? "match" : "mismatch", memo);
}
