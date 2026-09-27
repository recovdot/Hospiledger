import { expect, test } from "bun:test";
import { buildMemo, LOW_SIGNER_BALANCE_LAMPORTS } from "@hospiledger/shared";
import {
  blockhash,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Decoder,
  getBase58Encoder,
  getUtf8Encoder,
  lamports,
  signature,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";

import { AnchorError, createChainClient, createChainClientFromRpc } from "./client";

import type { KeyPairSigner } from "@solana/kit";

import type { ApiConfig } from "../config";
import type { LogFields, Logger } from "../logger";
import type { ChainClient, ChainRpc, ChainSignatureStatus, ChainTransaction, MemoRead } from "./types";

const CONTENT_HASH = "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
const MEMO = buildMemo({ assetCode: "HPL-2026-00001", version: 1, contentHash: CONTENT_HASH });
const SENT_SIGNATURE =
  "3sMSTdMkYDDc2rHzuQqFvvKcAsyNkEoVQmBEGSmRSNtVvM8XkqMFgvBrwZkuVvJsNqYPnGdReNsCyKGnUMgAv1j";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111";

const SIGNER_SEED = new Uint8Array(32).fill(7);
const TEST_SECRET =
  "5h6hMbEz8iX5gvPNvRvTHAHjvK1AJEuV9GpFPWX1Bw74Mmqx1QxSzeyiZ3iau9v4Hz1LVjTPcKcSqNrnRjKVQqrv";
const TEST_SECRET_ADDRESS = "8iCMWmdKLEiPpWViKS34558CNkrVEGgrSWQzFKNJRZ6N";

const CONFIG: ApiConfig = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  AI_API_KEY: "ai-key",
  AI_API_BASE_URL: "https://example.test/v1",
  AI_VISION_MODEL: "vision-model",
  SOLANA_CLUSTER: "devnet",
  SOLANA_RPC_URL: "https://api.devnet.solana.com",
  SOLANA_SIGNER_SECRET: TEST_SECRET,
};

type RecordedCall = { method: string; parameters: readonly unknown[] };

type FakeBehaviour = {
  lamports: number;
  blockHeight: bigint;
  confirmedStatus: ChainSignatureStatus | null;
  historyStatus: ChainSignatureStatus | null;
  transaction: ChainTransaction | null;
  statusesError: Error | null;
  transactionError: Error | null;
  sendError: Error | null;
  confirmationAfterSend: boolean;
  confirmationTransaction?: ChainTransaction | null;
};

const CONFIRMED_STATUS: ChainSignatureStatus = {
  slot: 12345n,
  err: null,
  confirmationStatus: "confirmed",
  confirmations: null,
};

const PROCESSED_STATUS: ChainSignatureStatus = {
  slot: 12345n,
  err: null,
  confirmationStatus: "processed",
  confirmations: 3n,
};

function createFakeChainRpc(behaviour: Partial<FakeBehaviour> = {}): {
  rpc: ChainRpc;
  calls: RecordedCall[];
} {
  const settings: FakeBehaviour = {
    lamports: 10_000_000,
    blockHeight: 400n,
    confirmedStatus: CONFIRMED_STATUS,
    historyStatus: null,
    transaction: null,
    statusesError: null,
    transactionError: null,
    sendError: null,
    confirmationAfterSend: true,
    ...behaviour,
  };
  const calls: RecordedCall[] = [];
  let sent = false;
  let queriedSignature = SENT_SIGNATURE;
  const rpc: ChainRpc = {
    getLatestBlockhash: (config) => {
      calls.push({ method: "getLatestBlockhash", parameters: [config] });
      return {
        send: async () => ({
          context: { slot: 1n },
          value: { blockhash: blockhash(BLOCKHASH), lastValidBlockHeight: 500n },
        }),
      };
    },
    getBlockHeight: (config) => {
      calls.push({ method: "getBlockHeight", parameters: [config] });
      return { send: async () => settings.blockHeight };
    },
    sendTransaction: (transaction, config) => {
      calls.push({ method: "sendTransaction", parameters: [transaction, config] });
      return {
        send: async () => {
          sent = true;
          if (settings.sendError !== null) throw settings.sendError;
          return signature(queriedSignature);
        },
      };
    },
    getSignatureStatuses: (signatures, config) => {
      calls.push({ method: "getSignatureStatuses", parameters: [signatures, config] });
      queriedSignature = String(signatures[0]);
      return {
        send: async () => {
          if (settings.statusesError !== null) throw settings.statusesError;
          const found = config?.searchTransactionHistory === true
            ? sent && settings.confirmationAfterSend ? settings.confirmedStatus : settings.historyStatus
            : settings.confirmedStatus;
          return { context: { slot: 1n }, value: [found] };
        },
      };
    },
    getTransaction: (txSignature, config) => {
      calls.push({ method: "getTransaction", parameters: [txSignature, config] });
      return {
        send: async () => {
          if (settings.transactionError !== null) throw settings.transactionError;
          return sent && settings.confirmationAfterSend
            ? settings.confirmationTransaction === undefined
              ? settings.transaction ?? storedTransaction([{ programId: MEMO_PROGRAM_ADDRESS, parsed: MEMO }])
              : settings.confirmationTransaction
            : settings.transaction;
        },
      };
    },
    getBalance: (address, config) => {
      calls.push({ method: "getBalance", parameters: [address, config] });
      return {
        send: async () => ({ context: { slot: 1n }, value: lamports(BigInt(settings.lamports)) }),
      };
    },
  };
  return { rpc, calls };
}

async function createClientUnderTest(
  behaviour: Partial<FakeBehaviour> = {},
  timing: { confirmTimeoutMs?: number; confirmPollMs?: number } = {},
): Promise<{
  client: ChainClient;
  calls: RecordedCall[];
  warnings: LogFields[];
  signer: KeyPairSigner;
}> {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(SIGNER_SEED);
  const { rpc, calls } = createFakeChainRpc(behaviour);
  const warnings: LogFields[] = [];
  const logger: Logger = {
    info: () => undefined,
    warn: (_message, fields) => {
      warnings.push(fields ?? {});
    },
    error: () => undefined,
  };
  const client = createChainClientFromRpc({
    rpc,
    signer,
    chainCluster: "devnet",
    logger,
    confirmTimeoutMs: timing.confirmTimeoutMs ?? 30_000,
    confirmPollMs: timing.confirmPollMs ?? 1,
  });
  return { client, calls, warnings, signer };
}

async function captureAnchorError(run: () => Promise<unknown>): Promise<AnchorError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AnchorError) return error;
    throw error;
  }
  throw new Error("Anchor seharusnya gagal, tetapi berhasil.");
}

function readSentWireTransaction(calls: readonly RecordedCall[]): string {
  const sent = calls.find((call) => call.method === "sendTransaction");
  const wireTransaction = sent?.parameters[0];
  if (typeof wireTransaction !== "string") throw new Error("Transaksi tidak dikirim sebagai base64.");
  return wireTransaction;
}

function readPolledSignatures(calls: readonly RecordedCall[]): string[] {
  const polled: string[] = [];
  for (const call of calls) {
    if (call.method !== "getSignatureStatuses") continue;
    const [signatures] = call.parameters;
    if (!Array.isArray(signatures)) continue;
    for (const entry of signatures) polled.push(String(entry));
  }
  return polled;
}

function storedTransaction(instructions: ChainTransaction["transaction"]["message"]["instructions"], errored = false): ChainTransaction {
  return {
    slot: 99n,
    meta: { err: errored ? { InstructionError: [0, { Custom: 1 }] } : null },
    transaction: { message: { instructions } },
  };
}

test("prepares without broadcasting, then signs identical bytes and confirms the memo", async () => {
  const { client, calls, signer } = await createClientUnderTest();
  const prepared = await client.prepareMemo(MEMO);
  expect(prepared).toEqual({
    txSignature: expect.any(String),
    blockhash: BLOCKHASH,
    lastValidBlockHeight: 500,
    chainCluster: "devnet",
  });
  expect(calls.map((call) => call.method)).toEqual(["getBalance", "getLatestBlockhash"]);
  expect(calls[0]?.parameters[0]).toBe(signer.address);

  const anchor = await client.broadcastPreparedMemo(MEMO, prepared);
  expect(anchor).toEqual({ txSignature: prepared.txSignature, slot: 99, chainCluster: "devnet" });
  expect(calls.find((call) => call.method === "getBlockHeight")?.parameters).toEqual([{ commitment: "confirmed" }]);
  expect(calls.find((call) => call.method === "sendTransaction")?.parameters[1]).toEqual({
    encoding: "base64",
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3n,
  });
  const wireTransaction = readSentWireTransaction(calls);
  expect(new TextDecoder().decode(Buffer.from(wireTransaction, "base64"))).toContain(MEMO);
  expect(readPolledSignatures(calls)).toEqual([prepared.txSignature, prepared.txSignature]);

  await client.broadcastPreparedMemo(MEMO, prepared);
  const sends = calls.filter((call) => call.method === "sendTransaction");
  expect(sends).toHaveLength(1);
});

test("retries the identical transaction after a timeout without preparing a new blockhash", async () => {
  const { client, calls } = await createClientUnderTest(
    { confirmedStatus: PROCESSED_STATUS, confirmationAfterSend: false },
    { confirmTimeoutMs: 0, confirmPollMs: 1 },
  );
  const prepared = await client.prepareMemo(MEMO);
  const first = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  const second = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  expect(first.retryable).toBe(true);
  expect(second.retryable).toBe(true);
  expect(calls.filter((call) => call.method === "sendTransaction").map((call) => call.parameters[0]))
    .toEqual([readSentWireTransaction(calls), readSentWireTransaction(calls)]);
  expect(calls.filter((call) => call.method === "getLatestBlockhash")).toHaveLength(1);
});

test("fails closed on an expired candidate absent from RPC history", async () => {
  const { client, calls } = await createClientUnderTest({ blockHeight: 501n });
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  expect(error.retryable).toBe(false);
  expect(calls.filter((call) => call.method === "sendTransaction")).toHaveLength(0);
});

test("rejects a changed memo without network I/O or a new candidate", async () => {
  const { client, calls } = await createClientUnderTest();
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() => client.broadcastPreparedMemo(`${MEMO} changed`, prepared));
  expect(error.retryable).toBe(false);
  expect(calls.filter((call) => call.method === "getSignatureStatuses")).toHaveLength(0);
});

test("fails closed when the persisted signature cannot be reproduced", async () => {
  const { client, calls } = await createClientUnderTest();
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() =>
    client.broadcastPreparedMemo(MEMO, { ...prepared, txSignature: SENT_SIGNATURE }),
  );
  expect(error.retryable).toBe(false);
  expect(calls.filter((call) => call.method === "sendTransaction")).toHaveLength(0);
});

test("reconciles an already confirmed expired candidate without resending", async () => {
  const { client, calls } = await createClientUnderTest({
    blockHeight: 501n,
    historyStatus: CONFIRMED_STATUS,
    transaction: storedTransaction([{ programId: MEMO_PROGRAM_ADDRESS, parsed: MEMO }]),
  });
  const prepared = await client.prepareMemo(MEMO);
  expect(await client.broadcastPreparedMemo(MEMO, prepared)).toEqual({
    txSignature: prepared.txSignature,
    slot: 99,
    chainCluster: "devnet",
  });
  expect(calls.filter((call) => call.method === "sendTransaction")).toHaveLength(0);
});

test("recovers an ambiguous RPC send by inspecting the persisted candidate", async () => {
  const { client, calls } = await createClientUnderTest({ sendError: new Error("RPC timed out") });
  const prepared = await client.prepareMemo(MEMO);
  const confirmed = await client.broadcastPreparedMemo(MEMO, prepared);
  expect(confirmed.txSignature).toBe(prepared.txSignature);
  expect(calls.filter((call) => call.method === "sendTransaction")).toHaveLength(1);
});

test("keeps an ambiguous send retryable when the history RPC cannot be reached", async () => {
  const { client, calls } = await createClientUnderTest({ statusesError: new Error("RPC unavailable") });
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  expect(error.retryable).toBe(true);
  expect(calls.filter((call) => call.method === "sendTransaction")).toHaveLength(0);
});

test("rejects an on-chain failure even when its transaction body is unreadable", async () => {
  const { client } = await createClientUnderTest({
    historyStatus: {
      ...CONFIRMED_STATUS,
      err: { InstructionError: [0, { Custom: 1 }] },
    },
  });
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  expect(error.retryable).toBe(false);
  expect(error.message).toContain("InstructionError");
});

test("does not confirm a known signature with an unreadable transaction body", async () => {
  const { client, calls } = await createClientUnderTest({ historyStatus: CONFIRMED_STATUS });
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  expect(error.retryable).toBe(true);
  expect(calls.filter((call) => call.method === "sendTransaction")).toHaveLength(0);
});

test("rejects a confirmed memo that differs from the approved snapshot", async () => {
  const { client } = await createClientUnderTest({
    historyStatus: CONFIRMED_STATUS,
    transaction: storedTransaction([{ programId: MEMO_PROGRAM_ADDRESS, parsed: "wrong memo" }]),
  });
  const prepared = await client.prepareMemo(MEMO);
  const error = await captureAnchorError(() => client.broadcastPreparedMemo(MEMO, prepared));
  expect(error.retryable).toBe(false);
});

test("refuses an anchor when the signer cannot pay the transaction fee", async () => {
  const { client, calls } = await createClientUnderTest({ lamports: 1_000 });
  const error = await captureAnchorError(() => client.prepareMemo(MEMO));
  expect(error.retryable).toBe(true);
  expect(calls.filter((call) => call.method === "getLatestBlockhash")).toHaveLength(0);
});

test("warns instead of failing when the signer balance is below the safe threshold", async () => {
  const { client, warnings } = await createClientUnderTest({ lamports: 1_000 });

  expect(await client.getSignerLamports()).toBe(1_000);
  expect(warnings).toEqual([{ lamports: 1_000, threshold: LOW_SIGNER_BALANCE_LAMPORTS }]);
});

test("stays quiet when the signer balance is healthy", async () => {
  const { client, warnings } = await createClientUnderTest({ lamports: LOW_SIGNER_BALANCE_LAMPORTS });

  expect(await client.getSignerLamports()).toBe(LOW_SIGNER_BALANCE_LAMPORTS);
  expect(warnings).toEqual([]);
});

test("reports a pruned pointer as not_found only after searching the full transaction history", async () => {
  const { client, calls } = await createClientUnderTest({ confirmedStatus: null, historyStatus: null });

  const read = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "not_found" });
  expect(calls.filter((call) => call.method === "getSignatureStatuses")).toEqual([
    { method: "getSignatureStatuses", parameters: [[SENT_SIGNATURE], { searchTransactionHistory: false }] },
    { method: "getSignatureStatuses", parameters: [[SENT_SIGNATURE], { searchTransactionHistory: true }] },
  ]);
  expect(calls.find((call) => call.method === "getTransaction")?.parameters[1]).toEqual({
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
});

test("reports an unconfirmed but known transaction as pending", async () => {
  const { client, calls } = await createClientUnderTest({ confirmedStatus: PROCESSED_STATUS });

  const read = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "pending" });
  expect(calls.filter((call) => call.method === "getSignatureStatuses")).toHaveLength(1);
});

test("reports a confirmed signature with no transaction body as unreachable", async () => {
  const { client } = await createClientUnderTest({ confirmedStatus: CONFIRMED_STATUS });
  expect((await client.readMemo(SENT_SIGNATURE)).kind).toBe("unreachable");
});

test("reports an errored signature without a body as not_found", async () => {
  const { client } = await createClientUnderTest({
    confirmedStatus: { ...CONFIRMED_STATUS, err: { InstructionError: [0, { Custom: 1 }] } },
  });
  expect(await client.readMemo(SENT_SIGNATURE)).toEqual({ kind: "not_found" });
});

test("searches history when the recent status cache misses a confirmed unreadable transaction", async () => {
  const { client } = await createClientUnderTest({
    confirmedStatus: null,
    historyStatus: CONFIRMED_STATUS,
  });
  expect((await client.readMemo(SENT_SIGNATURE)).kind).toBe("unreachable");
});
test("keeps an errored confirmed signature from appearing as a match", async () => {
  const { client } = await createClientUnderTest({
    confirmedStatus: { ...CONFIRMED_STATUS, err: { InstructionError: [0, { Custom: 1 }] } },
    transaction: storedTransaction([{ programId: MEMO_PROGRAM_ADDRESS, parsed: MEMO }]),
  });
  expect(await client.readMemo(SENT_SIGNATURE)).toEqual({ kind: "not_found" });
});


test("reports an RPC failure as unreachable instead of claiming a verdict", async () => {
  const { client } = await createClientUnderTest({ statusesError: new Error("429 Too Many Requests") });

  const read = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "unreachable", reason: "429 Too Many Requests" });
});

test("reads the memo from a parsed memo instruction", async () => {
  const { client } = await createClientUnderTest({
    transaction: storedTransaction([
      { programId: SYSTEM_PROGRAM_ADDRESS, parsed: { type: "transfer", info: { memo: MEMO } } },
      { programId: MEMO_PROGRAM_ADDRESS, parsed: { type: "memo", info: { memo: MEMO } } },
    ]),
  });

  const read = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "confirmed", slot: 99, memoText: MEMO, errored: false });
});

test("reads the memo from a partially decoded instruction by decoding base58 then UTF-8", async () => {
  const encoded = getBase58Decoder().decode(getUtf8Encoder().encode(MEMO));
  const { client } = await createClientUnderTest({
    transaction: storedTransaction([{ programId: MEMO_PROGRAM_ADDRESS, data: encoded }]),
  });

  const read = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "confirmed", slot: 99, memoText: MEMO, errored: false });
});

test("finds no memo when no instruction belongs to the memo program", async () => {
  const { client } = await createClientUnderTest({
    transaction: storedTransaction([
      { programId: SYSTEM_PROGRAM_ADDRESS, parsed: { type: "transfer", info: { memo: MEMO } } },
      { programId: MEMO_PROGRAM_ADDRESS, parsed: { type: "memo" } },
    ]),
  });

  const read = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "confirmed", slot: 99, memoText: null, errored: false });
});

test("flags a confirmed transaction that failed on-chain", async () => {
  const { client } = await createClientUnderTest({
    transaction: storedTransaction(
      [{ programId: MEMO_PROGRAM_ADDRESS, parsed: { type: "memo", info: { memo: MEMO } } }],
      true,
    ),
  });

  const read: MemoRead = await client.readMemo(SENT_SIGNATURE);

  expect(read).toEqual({ kind: "confirmed", slot: 99, memoText: MEMO, errored: true });
});

test("derives the signer address from the base58 secret", async () => {
  const client = createChainClient(CONFIG, {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  });

  expect(client.chainCluster).toBe("devnet");
  expect(client.getSignerAddress()).toBe(TEST_SECRET_ADDRESS);
  const sdkSigner = await createKeyPairSignerFromBytes(getBase58Encoder().encode(TEST_SECRET));
  expect(client.getSignerAddress()).toBe(sdkSigner.address);
});

test("rejects a signer secret that is not a 64-byte base58 key", () => {
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

  expect(() => createChainClient({ ...CONFIG, SOLANA_SIGNER_SECRET: "not-base58-0OIl" }, logger)).toThrow(
    /base58/,
  );
  expect(() => createChainClient({ ...CONFIG, SOLANA_SIGNER_SECRET: "1" }, logger)).toThrow(/64 byte/);
});
