import { ANCHOR_CONFIRM_TIMEOUT_MS, LOW_SIGNER_BALANCE_LAMPORTS } from "@hospiledger/shared";
import { getAddMemoInstruction, SUPPORTED_MEMO_PROGRAM_ADDRESSES } from "@solana-program/memo";
import {
  address,
  appendTransactionMessageInstruction,
  assertIsTransactionWithBlockhashLifetime,
  blockhash,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  devnet,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getUtf8Decoder,
  mainnet,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  signTransactionMessageWithSigners,
  testnet,
} from "@solana/kit";

import type { Address, ClusterUrl, KeyPairSigner } from "@solana/kit";

import type { ApiConfig } from "../config";
import type { Logger } from "../logger";
import type {
  AnchorResult,
  ChainClient,
  ChainClientDeps,
  ChainInstruction,
  ChainTransaction,
  MemoRead,
  PreparedMemo,
} from "./types";

/**
 * Confirmation polling interval for a sent anchor transaction. The job's own retry budget handles
 * transient RPC outages, so polling stays cheap and infrequent.
 */
const ANCHOR_CONFIRM_POLL_MS = 1_000;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Raised when an anchor attempt fails; `retryable` tells the job runner whether to try again. */
export class AnchorError extends Error {
  readonly retryable: boolean;

  /**
   * @param message failure description, safe to log
   * @param retryable whether a later attempt could still succeed
   */
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AnchorError";
    this.retryable = retryable;
  }
}

type SignerHandle = {
  address: Address;
  resolve: () => Promise<KeyPairSigner>;
};

/** Encodes bytes as base58, with the leading-zero handling Solana addresses use. */
function toBase58(input: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < input.length && input[leadingZeros] === 0) leadingZeros++;
  if (leadingZeros === input.length) return "1".repeat(leadingZeros);
  const digits: number[] = [0];
  for (let index = leadingZeros; index < input.length; index++) {
    let carry = input[index] ?? 0;
    for (let position = 0; position < digits.length; position++) {
      carry += (digits[position] ?? 0) << 8;
      digits[position] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = "";
  for (let position = digits.length - 1; position >= 0; position--) {
    encoded += BASE58_ALPHABET[digits[position] ?? 0] ?? "";
  }
  return "1".repeat(leadingZeros) + encoded;
}

/** Decodes base58; rejects characters outside the alphabet. */
function fromBase58(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index++) {
    let carry = BASE58_ALPHABET.indexOf(input[index] ?? "");
    if (carry < 0) throw new Error(`Karakter base58 tidak valid: ${input[index]}.`);
    for (let position = 0; position < bytes.length; position++) {
      carry += (bytes[position] ?? 0) * 58;
      bytes[position] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingOnes = 0;
  while (input[leadingOnes] === "1") leadingOnes++;
  const decoded = new Uint8Array(leadingOnes + bytes.length);
  decoded.set(bytes.reverse(), leadingOnes);
  return decoded;
}

/**
 * Reads the signer secret as the 64 bytes (seed followed by public key) the SDK expects.
 *
 * @param secret base58-encoded `SOLANA_SIGNER_SECRET`
 * @returns the decoded 64 bytes
 * @throws {Error} when the secret is not base58 or not exactly 64 bytes
 */
function decodeSignerSecret(secret: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = fromBase58(secret.trim());
  } catch (cause) {
    throw new Error("SOLANA_SIGNER_SECRET bukan base58 yang valid.", { cause });
  }
  if (bytes.length !== 64) {
    throw new Error(
      `SOLANA_SIGNER_SECRET harus 64 byte (seed diikuti public key), bukan ${bytes.length} byte.`,
    );
  }
  return bytes;
}

/**
 * Brands the configured RPC URL for its cluster, which `createSolanaRpc` requires.
 *
 * @param config API configuration holding the cluster name and its RPC URL
 * @returns the RPC URL branded for the configured cluster
 */
function toClusterUrl(config: ApiConfig): ClusterUrl {
  switch (config.SOLANA_CLUSTER) {
    case "devnet":
      return devnet(config.SOLANA_RPC_URL);
    case "testnet":
      return testnet(config.SOLANA_RPC_URL);
    case "mainnet-beta":
      return mainnet(config.SOLANA_RPC_URL);
  }
}

/**
 * Builds the Memo program instruction carrying an anchor string.
 *
 * @param memo memo text, as produced by `buildMemo`
 * @returns the version 4 Memo program instruction
 */
export function buildMemoInstruction(memo: string) {
  return getAddMemoInstruction({ memo });
}

/** Decodes base58 instruction data as UTF-8. Base58 decodes to bytes first; the text comes second. */
function decodeMemoData(encoded: string): string | null {
  try {
    return getUtf8Decoder().decode(getBase58Encoder().encode(encoded));
  } catch {
    return null;
  }
}

/**
 * Reads the memo from an instruction the cluster parsed. Devnet emits the memo string itself as
 * `parsed` while the origin SDK models it as `{ type, info: { memo } }`, so both shapes are read.
 *
 * @param instruction instruction of the memo program
 * @returns the memo text, or `null` when the instruction carries none in an expected shape
 */
function readParsedMemo(instruction: ChainInstruction): string | null {
  const parsed = instruction.parsed;
  if (typeof parsed === "string" && parsed.length > 0) return parsed;
  if (typeof parsed === "object" && parsed !== null) {
    const text = (parsed as { memo?: unknown }).memo;
    if (typeof text === "string" && text.length > 0) return text;
    const info = (parsed as { info?: unknown }).info;
    if (typeof info === "object" && info !== null) {
      const memo = (info as { memo?: unknown }).memo;
      if (typeof memo === "string" && memo.length > 0) return memo;
    }
  }
  return null;
}

/**
 * Finds the anchor memo among a transaction's instructions.
 *
 * Devnet may return the Memo program either parsed or partially decoded, so both shapes are read;
 * anything unrecognized yields `null` instead of throwing.
 *
 * @param transaction the `jsonParsed` transaction as returned by the cluster
 * @returns the memo text of the first Memo program instruction, or `null` when there is none
 */
function readMemoText(transaction: ChainTransaction): string | null {
  const instructions: readonly ChainInstruction[] | undefined =
    transaction.transaction?.message?.instructions;
  if (!instructions) return null;
  for (const instruction of instructions) {
    if (!SUPPORTED_MEMO_PROGRAM_ADDRESSES.some((memoProgram) => memoProgram === instruction.programId)) {
      continue;
    }
    const parsedMemo = readParsedMemo(instruction);
    if (parsedMemo !== null) return parsedMemo;

    if (typeof instruction.data === "string") {
      const decodedMemo = decodeMemoData(instruction.data);
      if (decodedMemo !== null) return decodedMemo;
    }
  }
  return null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    return typeof json === "string" ? json : String(error);
  } catch {
    return String(error);
  }
}

function buildChainClient(deps: Omit<ChainClientDeps, "signer">, signer: SignerHandle): ChainClient {
  const { rpc, chainCluster, logger, confirmTimeoutMs, confirmPollMs } = deps;

  const getSignerAddress = (): string => signer.address;

  const getSignerLamports = async (): Promise<number> => {
    const { value: lamports } = await rpc.getBalance(signer.address).send();
    const balance = Number(lamports);
    if (balance < LOW_SIGNER_BALANCE_LAMPORTS) {
      logger.warn("Saldo signer Solana di bawah batas aman; isi ulang sebelum anchor berikutnya.", {
        lamports: balance,
        threshold: LOW_SIGNER_BALANCE_LAMPORTS,
      });
    }
    return balance;
  };

  const signMemo = async (memo: string, lifetime: { blockhash: string; lastValidBlockHeight: number }) => {
    const signerKeyPair = await signer.resolve();
    if (signerKeyPair.address !== signer.address) {
      throw new AnchorError("Signer anchor berbeda dari alamat yang dikonfigurasi.", false);
    }
    const message = createTransactionMessage({ version: 0 });
    const withFeePayer = setTransactionMessageFeePayerSigner(signerKeyPair, message);
    const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash(lifetime.blockhash), lastValidBlockHeight: BigInt(lifetime.lastValidBlockHeight) },
      withFeePayer,
    );
    const withMemo = appendTransactionMessageInstruction(buildMemoInstruction(memo), withLifetime);
    const signed = await signTransactionMessageWithSigners(withMemo);
    assertIsTransactionWithBlockhashLifetime(signed);
    return signed;
  };

  const prepareMemo = async (memo: string): Promise<PreparedMemo> => {
    try {
      if ((await getSignerLamports()) < 5_000) {
        throw new AnchorError("Saldo signer tidak cukup untuk biaya transaksi anchor.", true);
      }
      const { value: lifetime } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      const preparedLifetime = {
        blockhash: String(lifetime.blockhash),
        lastValidBlockHeight: Number(lifetime.lastValidBlockHeight),
      };
      if (!Number.isSafeInteger(preparedLifetime.lastValidBlockHeight)) {
        throw new AnchorError("Tinggi blok kedaluwarsa tidak aman untuk disimpan.", false);
      }
      const signed = await signMemo(memo, preparedLifetime);
      return {
        txSignature: String(getSignatureFromTransaction(signed)),
        ...preparedLifetime,
        chainCluster,
      };
    } catch (error) {
      if (error instanceof AnchorError) throw error;
      throw new AnchorError(`Persiapan transaksi anchor gagal: ${describeError(error)}.`, true);
    }
  };

  const inspectCandidate = async (memo: string, txSignature: string): Promise<number | null> => {
    const confirmedSignature = signature(txSignature);
    const { value: statuses } = await rpc
      .getSignatureStatuses([confirmedSignature], { searchTransactionHistory: true })
      .send();
    const status = statuses[0] ?? null;
    if (status?.err != null) {
      throw new AnchorError(`Transaksi anchor gagal di on-chain: ${describeError(status.err)}.`, false);
    }
    const transaction = await rpc
      .getTransaction(confirmedSignature, {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      })
      .send();
    if (transaction !== null) {
      if (transaction.meta === null) {
        throw new AnchorError("Metadata transaksi anchor tidak dapat dibaca.", true);
      }
      if (transaction.meta.err !== null) {
        throw new AnchorError(`Transaksi anchor gagal di on-chain: ${describeError(transaction.meta.err)}.`, false);
      }
      if (readMemoText(transaction) !== memo) {
        throw new AnchorError("Memo transaksi anchor berbeda dari snapshot yang disetujui.", false);
      }
      return Number(transaction.slot);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      throw new AnchorError("Transaksi anchor sudah terkonfirmasi tetapi isinya tidak dapat dibaca.", true);
    }
    return null;
  };

  const broadcastPreparedMemo = async (memo: string, prepared: PreparedMemo): Promise<AnchorResult> => {
    if (prepared.chainCluster !== chainCluster) {
      throw new AnchorError("Cluster kandidat anchor berbeda dari cluster yang dikonfigurasi.", false);
    }
    if (!Number.isSafeInteger(prepared.lastValidBlockHeight) || prepared.lastValidBlockHeight < 0) {
      throw new AnchorError("Tinggi blok kandidat anchor tidak valid.", false);
    }
    const signed = await signMemo(memo, prepared).catch((error: unknown) => {
      if (error instanceof AnchorError) throw error;
      throw new AnchorError(`Kandidat anchor tidak dapat ditandatangani ulang: ${describeError(error)}.`, false);
    });
    if (String(getSignatureFromTransaction(signed)) !== prepared.txSignature) {
      throw new AnchorError("Kandidat anchor tidak cocok dengan memo atau signer saat ini.", false);
    }
    const inspect = async (): Promise<number | null> => {
      try {
        return await inspectCandidate(memo, prepared.txSignature);
      } catch (error) {
        if (error instanceof AnchorError) throw error;
        throw new AnchorError(`Riwayat transaksi anchor tidak dapat dibaca: ${describeError(error)}.`, true);
      }
    };
    const firstSlot = await inspect();
    if (firstSlot !== null) return { txSignature: prepared.txSignature, slot: firstSlot, chainCluster };

    let height: bigint;
    try {
      height = await rpc.getBlockHeight({ commitment: "confirmed" }).send();
    } catch (error) {
      throw new AnchorError(`Tinggi blok anchor tidak dapat dibaca: ${describeError(error)}.`, true);
    }
    if (height > BigInt(prepared.lastValidBlockHeight)) {
      throw new AnchorError("Kandidat anchor kedaluwarsa; riwayat RPC tidak membuktikan ketiadaannya. Perlu rekonsiliasi operator.", false);
    }
    try {
      if ((await getSignerLamports()) < 5_000) {
        throw new AnchorError("Saldo signer tidak cukup untuk biaya transaksi anchor.", true);
      }
      const returnedSignature = await rpc
        .sendTransaction(getBase64EncodedWireTransaction(signed), {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3n,
        })
        .send();
      if (returnedSignature !== prepared.txSignature) {
        throw new AnchorError("RPC mengembalikan signature berbeda dari kandidat anchor.", false);
      }
    } catch (error) {
      if (error instanceof AnchorError && !error.retryable) throw error;
      const slot = await inspect();
      if (slot !== null) return { txSignature: prepared.txSignature, slot, chainCluster };
      throw new AnchorError(`Pengiriman anchor ambigu: ${describeError(error)}.`, true);
    }
    const deadline = Date.now() + confirmTimeoutMs;
    for (;;) {
      const slot = await inspect();
      if (slot !== null) return { txSignature: prepared.txSignature, slot, chainCluster };
      if (Date.now() >= deadline) {
        throw new AnchorError(`Konfirmasi transaksi anchor melewati batas ${confirmTimeoutMs} ms.`, true);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, confirmPollMs));
    }
  };

  const readMemo = async (txSignature: string): Promise<MemoRead> => {
    try {
      const confirmedSignature = signature(txSignature);
      const { value: statuses } = await rpc
        .getSignatureStatuses([confirmedSignature], { searchTransactionHistory: false })
        .send();
      if (statuses[0]?.err != null) return { kind: "not_found" };
      const transaction = await rpc
        .getTransaction(confirmedSignature, {
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        })
        .send();
      if (transaction !== null) {
        if (transaction.meta === null) return { kind: "unreachable", reason: "Metadata transaksi tidak tersedia." };
        return {
          kind: "confirmed",
          slot: Number(transaction.slot),
          memoText: readMemoText(transaction),
          errored: transaction.meta.err !== null,
        };
      }
      let status = statuses[0] ?? null;
      if (status === null) {
        const { value: historyStatuses } = await rpc
          .getSignatureStatuses([confirmedSignature], { searchTransactionHistory: true })
          .send();
        status = historyStatuses[0] ?? null;
      }
      if (status === null || status.err !== null) return { kind: "not_found" };
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return { kind: "unreachable", reason: "Transaksi terkonfirmasi tetapi isinya tidak tersedia." };
      }
      return { kind: "pending" };
    } catch (error) {
      return { kind: "unreachable", reason: describeError(error) };
    }
  };

  return { chainCluster, getSignerAddress, getSignerLamports, prepareMemo, broadcastPreparedMemo, readMemo };
}

/**
 * Creates the chain client from an already-built RPC client and signer.
 *
 * @param deps RPC client slice, signer, cluster name, logger and confirmation timing
 * @returns the chain client
 */
export function createChainClientFromRpc(deps: ChainClientDeps): ChainClient {
  return buildChainClient(deps, {
    address: address(deps.signer.address),
    resolve: async () => deps.signer,
  });
}

/**
 * Creates the chain client from the API configuration.
 *
 * The signer keypair is materialized on first use, because the SDK imports the ed25519 key through
 * WebCrypto asynchronously while `ChainClient` exposes the signer address synchronously; that
 * address is derived from the public key half of the secret instead.
 *
 * @param config API configuration holding the cluster, its RPC URL and the signer secret
 * @param logger structured logger for anchor and balance events
 * @returns the chain client
 * @throws {Error} when `SOLANA_SIGNER_SECRET` is not a 64-byte base58 secret
 */
export function createChainClient(config: ApiConfig, logger: Logger): ChainClient {
  const secret = decodeSignerSecret(config.SOLANA_SIGNER_SECRET);
  const signerKeyPair = createKeyPairSignerFromBytes(secret);
  void signerKeyPair.catch(() => undefined);
  return buildChainClient(
    {
      rpc: createSolanaRpc(toClusterUrl(config)),
      chainCluster: config.SOLANA_CLUSTER,
      logger,
      confirmTimeoutMs: ANCHOR_CONFIRM_TIMEOUT_MS,
      confirmPollMs: ANCHOR_CONFIRM_POLL_MS,
    },
    {
      address: address(toBase58(secret.subarray(32))),
      resolve: () => signerKeyPair,
    },
  );
}
