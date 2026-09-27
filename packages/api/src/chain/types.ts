import type { Address, Blockhash, Commitment, KeyPairSigner, Lamports, Signature, Slot } from "@solana/kit";

import type { Logger } from "../logger";

/** Pointer to a confirmed on-chain anchor. The content hash itself never leaves the memo. */
export type AnchorResult = {
  txSignature: string;
  slot: number;
  chainCluster: string;
};

/** Signed candidate metadata persisted before any network broadcast; never stores memo or wire bytes. */
export type PreparedMemo = {
  txSignature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  chainCluster: string;
};

/** Outcome of reading a recorded transaction back from the cluster. */
export type MemoRead =
  | { kind: "confirmed"; slot: number; memoText: string | null; errored: boolean }
  | { kind: "pending" }
  | { kind: "not_found" }
  | { kind: "unreachable"; reason: string };

/** Solana access used by anchor jobs and by public anchor verification. */
export type ChainClient = {
  readonly chainCluster: string;
  getSignerAddress(): string;
  getSignerLamports(): Promise<number>;
  prepareMemo(memo: string): Promise<PreparedMemo>;
  broadcastPreparedMemo(memo: string, prepared: PreparedMemo): Promise<AnchorResult>;
  readMemo(txSignature: string): Promise<MemoRead>;
};

/** One entry of the `getSignatureStatuses` value array. */
export type ChainSignatureStatus = Readonly<{
  slot: Slot;
  err: unknown;
  confirmationStatus: Commitment | null;
  confirmations: bigint | null;
}>;

/** An instruction whose owning program registered a parser, so it arrives as structured JSON. */
export type ChainParsedInstruction = Readonly<{
  programId: string;
  parsed: Readonly<{ type: string; info?: unknown }>;
}>;

/** An instruction with no parser, so it arrives as base58 instruction data plus its accounts. */
export type ChainPartiallyDecodedInstruction = Readonly<{
  programId: string;
  data?: string;
}>;

/** May come from the cluster parsed (`parsed: string | { type, info }`) or base58-encoded (`data`). */
export type ChainInstruction = {
  programId: string;
  parsed?: unknown;
  data?: string;
};

/** The parts of a `jsonParsed` transaction this module reads. */
export type ChainTransaction = Readonly<{
  slot: Slot;
  meta: Readonly<{ err: unknown }> | null;
  transaction: Readonly<{
    message: Readonly<{ instructions: readonly ChainInstruction[] }>;
  }>;
}>;

/**
 * RPC slice used to prepare, broadcast, reconcile and read anchors. Methods return SDK pending
 * requests; the real `createSolanaRpc(...)` remains assignable without an adapter.
 */
export type ChainRpc = {
  getLatestBlockhash(config?: Readonly<{ commitment?: Commitment }>): {
    send: () => Promise<
      Readonly<{
        context: Readonly<{ slot: Slot }>;
        value: Readonly<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>;
      }>
    >;
  };
  getBlockHeight(config?: Readonly<{ commitment?: Commitment }>): { send: () => Promise<bigint> };
  sendTransaction(
    transaction: string,
    config?: Readonly<{
      encoding: "base64";
      skipPreflight?: boolean;
      preflightCommitment?: Commitment;
      maxRetries?: bigint;
    }>,
  ): { send: () => Promise<Signature> };
  getSignatureStatuses(
    signatures: readonly Signature[],
    config?: Readonly<{ searchTransactionHistory?: boolean }>,
  ): {
    send: () => Promise<
      Readonly<{
        context: Readonly<{ slot: Slot }>;
        value: readonly (ChainSignatureStatus | null)[];
      }>
    >;
  };
  getTransaction(
    signature: Signature,
    config: Readonly<{ encoding: "jsonParsed"; maxSupportedTransactionVersion: 0; commitment?: Commitment }>,
  ): { send: () => Promise<ChainTransaction | null> };
  getBalance(
    address: Address,
    config?: Readonly<{ commitment?: Commitment }>,
  ): {
    send: () => Promise<Readonly<{ context: Readonly<{ slot: Slot }>; value: Lamports }>>;
  };
};

/** Everything the chain client needs, all injectable so tests never touch the network. */
export type ChainClientDeps = {
  rpc: ChainRpc;
  signer: KeyPairSigner;
  chainCluster: string;
  logger: Logger;
  confirmTimeoutMs: number;
  confirmPollMs: number;
};
