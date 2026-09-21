import { expect, test } from "bun:test";
import { buildMemo } from "@hospiledger/shared";

import { toAnchorVerification } from "./verification";

import type { ChainStatus } from "@hospiledger/shared";

import type { MemoRead } from "./types";

const ASSET_CODE = "HPL-2026-00001";
const CONTENT_HASH = "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
const OTHER_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const TX_SIGNATURE =
  "3sMSTdMkYDDc2rHzuQqFvvKcAsyNkEoVQmBEGSmRSNtVvM8XkqMFgvBrwZkuVvJsNqYPnGdReNsCyKGnUMgAv1j";
const CHECKED_AT = new Date("2026-09-20T10:00:00.000Z");

type RecordFixture = {
  chainStatus: ChainStatus;
  txSignature: string | null;
  chainCluster: string | null;
  version: number;
};

const RECORD: RecordFixture = {
  chainStatus: "confirmed",
  txSignature: TX_SIGNATURE,
  chainCluster: "devnet",
  version: 4,
};

const ANCHORED_MEMO = buildMemo({ assetCode: ASSET_CODE, version: 4, contentHash: CONTENT_HASH });

const INITIAL_READ: MemoRead = {
  kind: "confirmed",
  slot: 99,
  memoText: ANCHORED_MEMO,
  errored: false,
};

type Overrides = {
  record?: RecordFixture | null;
  memoRead?: MemoRead | null;
  assetCode?: string;
  contentHash?: string;
};

function verificationInput(overrides: Overrides = {}) {
  return {
    record: overrides.record === undefined ? RECORD : overrides.record,
    assetCode: overrides.assetCode ?? ASSET_CODE,
    contentHash: overrides.contentHash ?? CONTENT_HASH,
    memoRead: overrides.memoRead === undefined ? INITIAL_READ : overrides.memoRead,
    checkedAt: CHECKED_AT,
  };
}

function readMemo(memoText: string | null, errored = false): MemoRead {
  return { kind: "confirmed", slot: 99, memoText, errored };
}

test("reports match when the anchored memo equals the stored content", () => {
  const verification = toAnchorVerification(verificationInput());

  expect(verification).toEqual({
    result: "match",
    txSignature: TX_SIGNATURE,
    chainCluster: "devnet",
    memoAssetCode: ASSET_CODE,
    memoVersion: 4,
    memoContentHash: CONTENT_HASH,
    recomputedContentHash: CONTENT_HASH,
    checkedAt: CHECKED_AT,
  });
});

const pendingCases: readonly (readonly [string, Overrides])[] = [
  ["a missing record", { record: null }],
  ["a record still pending", { record: { ...RECORD, chainStatus: "pending" } }],
  ["a record marked failed", { record: { ...RECORD, chainStatus: "failed" } }],
  ["a record without a signature", { record: { ...RECORD, txSignature: null } }],
  ["no memo read yet", { memoRead: null }],
  ["a memo read still pending", { memoRead: { kind: "pending" } }],
];

for (const [label, overrides] of pendingCases) {
  test(`reports pending for ${label}`, () => {
    const verification = toAnchorVerification(verificationInput(overrides));

    expect(verification.result).toBe("pending");
    expect(verification.memoAssetCode).toBeNull();
    expect(verification.memoVersion).toBeNull();
    expect(verification.memoContentHash).toBeNull();
    expect(verification.recomputedContentHash).toBe(CONTENT_HASH);
    expect(verification.checkedAt).toBe(CHECKED_AT);
  });
}

test("carries the recorded pointer on a pending verdict", () => {
  const verification = toAnchorVerification(verificationInput({ memoRead: null }));

  expect(verification.txSignature).toBe(TX_SIGNATURE);
  expect(verification.chainCluster).toBe("devnet");
});

test("reports unreachable when the cluster could not be read", () => {
  const verification = toAnchorVerification(
    verificationInput({ memoRead: { kind: "unreachable", reason: "429 Too Many Requests" } }),
  );

  expect(verification.result).toBe("unreachable");
  expect(verification.txSignature).toBe(TX_SIGNATURE);
  expect(verification.memoContentHash).toBeNull();
});

test("reports not_found when the transaction is gone from the cluster", () => {
  const verification = toAnchorVerification(verificationInput({ memoRead: { kind: "not_found" } }));

  expect(verification.result).toBe("not_found");
  expect(verification.memoAssetCode).toBeNull();
});

test("reports not_found when the recorded transaction failed on-chain", () => {
  const verification = toAnchorVerification(verificationInput({ memoRead: readMemo(ANCHORED_MEMO, true) }));

  expect(verification.result).toBe("not_found");
  expect(verification.memoContentHash).toBeNull();
});

const mismatchCases: readonly (readonly [string, MemoRead])[] = [
  ["no memo instruction at all", readMemo(null)],
  ["unparsable memo text", readMemo("garbage")],
  [
    "a memo for a different asset code",
    readMemo(buildMemo({ assetCode: "HPL-2026-00002", version: 4, contentHash: CONTENT_HASH })),
  ],
  [
    "a memo for a different content hash",
    readMemo(buildMemo({ assetCode: ASSET_CODE, version: 4, contentHash: OTHER_HASH })),
  ],
];

for (const [label, memoRead] of mismatchCases) {
  test(`reports mismatch for ${label}`, () => {
    const verification = toAnchorVerification(verificationInput({ memoRead }));

    expect(verification.result).toBe("mismatch");
  });
}

test("reports mismatch when the anchored memo carries a different version", () => {
  const verification = toAnchorVerification(
    verificationInput({
      record: { ...RECORD, version: 3 },
      memoRead: readMemo(buildMemo({ assetCode: ASSET_CODE, version: 4, contentHash: CONTENT_HASH })),
    }),
  );

  expect(verification.result).toBe("mismatch");
  expect(verification.memoVersion).toBe(4);
});

test("shows both hashes when only the content hash differs", () => {
  const verification = toAnchorVerification(
    verificationInput({
      memoRead: readMemo(buildMemo({ assetCode: ASSET_CODE, version: 4, contentHash: OTHER_HASH })),
    }),
  );

  expect(verification.memoContentHash).toBe(OTHER_HASH);
  expect(verification.recomputedContentHash).toBe(CONTENT_HASH);
});

test("shows the anchored asset code when the passport does not match its anchor", () => {
  const verification = toAnchorVerification(
    verificationInput({
      memoRead: readMemo(buildMemo({ assetCode: "HPL-2026-00002", version: 4, contentHash: CONTENT_HASH })),
    }),
  );

  expect(verification.memoAssetCode).toBe("HPL-2026-00002");
});
