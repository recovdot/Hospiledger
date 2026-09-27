import type { AnchorVerification } from "@hospiledger/shared";
import { VERIFY_RESULT_LABEL } from "@/lib/format";
import { formatDateTime } from "@/lib/format";

const TONE_CLASSES: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-red-200 bg-red-50 text-red-700",
  muted: "border-border bg-black/[0.03] text-ink-muted",
};

/**
 * Renders one integrity verification result, including the memo hash, the recomputed hash when known,
 * and when the check ran.
 *
 * @param verification the anchor verification payload, or `null` for "not verified yet"
 * @returns the verification panel
 */
export function VerifyResult({ verification }: { verification: AnchorVerification | null }) {
  if (!verification) {
    return (
      <div aria-live="polite" aria-labelledby="verify-result-label">
        <p className="rounded-2xl border border-border bg-black/[0.02] px-4 py-3 text-sm text-ink-muted">
          Integritas belum diverifikasi.
        </p>
      </div>
    );
  }
  const entry = VERIFY_RESULT_LABEL[verification.result];
  return (
    <div aria-live="polite" aria-labelledby="verify-result-label" className={`rounded-2xl border px-4 py-3 text-sm ${TONE_CLASSES[entry.tone]}`}>
      <p id="verify-result-label" className="font-medium">{entry.label}</p>
      <dl className="mt-2 flex flex-col gap-1 font-mono text-xs">
        {verification.memoContentHash && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-sans text-ink-muted">Hash di memo:</dt>
            <dd className="break-all">{verification.memoContentHash}</dd>
          </div>
        )}
        {verification.recomputedContentHash && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-sans text-ink-muted">Hash hitung ulang:</dt>
            <dd className="break-all">{verification.recomputedContentHash}</dd>
          </div>
        )}
        <div className="font-sans text-xs text-ink-muted">
          Diperiksa {formatDateTime(verification.checkedAt)}
        </div>
      </dl>
    </div>
  );
}
