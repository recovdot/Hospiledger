import type { ChainAnchor } from "@hospiledger/shared";

import { ENV } from "@/env";

/**
 * Renders the exact chain-status copy AGENTS.md mandates. `pending`/`failed` only ever render for
 * `viewer="seller"` — the public passport page only loads `published` passports, which are only
 * reachable once the anchor is `confirmed`, so a guest never sees the other two states.
 */
export function ChainBadge({ chain, viewer }: { chain: ChainAnchor | null; viewer: "seller" | "public" }) {
  if (!chain) return null;

  if (chain.chainStatus === "confirmed") {
    const explorerUrl = chain.txSignature
      ? `https://explorer.solana.com/tx/${chain.txSignature}?cluster=${ENV.SOLANA_EXPLORER_CLUSTER}`
      : null;
    return (
      <a
        href={explorerUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong transition-colors hover:bg-brand/20"
      >
        Tercatat di Solana
      </a>
    );
  }

  if (viewer !== "seller") return null;

  if (chain.chainStatus === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-ink-muted">
        Menunggu pencatatan Solana
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
      Pencatatan gagal
    </span>
  );
}
