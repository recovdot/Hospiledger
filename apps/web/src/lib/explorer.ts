import { ENV } from "@/env";

/**
 * Builds a Solana Explorer link for a transaction. The cluster query parameter comes from
 * `VITE_SOLANA_EXPLORER_CLUSTER`; no cluster name is hardcoded here.
 *
 * @param txSignature transaction signature stored on the passport record
 * @returns the explorer URL
 */
export function explorerTxUrl(txSignature: string): string {
  const cluster = ENV.SOLANA_EXPLORER_CLUSTER;
  const base = `https://explorer.solana.com/tx/${txSignature}`;
  return cluster ? `${base}?cluster=${encodeURIComponent(cluster)}` : base;
}
