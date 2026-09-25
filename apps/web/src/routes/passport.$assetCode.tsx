import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import type { VerificationResult } from "@hospiledger/shared";

import { ConditionScore } from "@/components/passport/condition-score";
import { DamageList } from "@/components/passport/damage-list";
import { ChainBadge } from "@/components/passport/chain-badge";
import { formatDate, formatRupiahRange } from "@/lib/format";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/passport/$assetCode")({
  component: PublicPassportPage,
});

const VERIFY_LABELS: Record<VerificationResult, { label: string; className: string }> = {
  match: { label: "Terverifikasi: data cocok dengan Solana", className: "bg-brand/10 text-brand-strong" },
  mismatch: { label: "Peringatan: data tidak cocok dengan Solana", className: "bg-red-50 text-red-600" },
  pending: { label: "Pencatatan masih diproses", className: "bg-canvas text-ink-muted" },
  not_found: { label: "Transaksi tidak ditemukan di Solana", className: "bg-red-50 text-red-600" },
  unreachable: { label: "Tidak dapat menghubungi jaringan Solana, coba lagi", className: "bg-canvas text-ink-muted" },
};

function PublicPassportPage() {
  const { assetCode } = Route.useParams();
  const { data, isLoading, error } = useQuery(trpc.publicPassports.getByCode.queryOptions({ assetCode }));
  const [verifyResult, setVerifyResult] = useState<VerificationResult | undefined>();
  const [verifyError, setVerifyError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(undefined);
    try {
      const result = await trpcClient.publicPassports.verify.query({ assetCode });
      setVerifyResult(result.verification.result);
    } catch (e) {
      setVerifyError(isTRPCClientError(e) ? e.message : "Gagal memverifikasi.");
    } finally {
      setVerifying(false);
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-muted">Memuat...</div>;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-5 text-center">
        <p className="text-lg font-medium text-black">Passport tidak ditemukan.</p>
        <Link to="/" className="text-sm text-brand-strong underline underline-offset-4">
          Kembali ke beranda
        </Link>
      </div>
    );
  }

  const { passport } = data;

  return (
    <div className="min-h-screen bg-canvas text-black">
      <header className="border-b border-black/10 px-5">
        <div className="mx-auto flex h-[72px] max-w-3xl items-center">
          <Link to="/" className="text-lg font-bold tracking-tight">
            HospiLedger
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-[28px] bg-white p-6 md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-ink-muted">{passport.assetCode}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {passport.brand} {passport.model}
              </h1>
              <p className="text-sm text-ink-muted">{passport.category}</p>
            </div>
            <ChainBadge chain={passport.chain} viewer="public" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">Estimasi nilai</dt>
              <dd className="mt-0.5 font-medium">{formatRupiahRange(passport.valueMin, passport.valueMax, passport.valueEstimate)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Nomor seri</dt>
              <dd className="mt-0.5 font-medium">{passport.serialNumber ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Dipublikasikan</dt>
              <dd className="mt-0.5 font-medium">{formatDate(passport.publishedAt)}</dd>
            </div>
          </div>

          <div className="mt-8">
            <ConditionScore score={passport.conditionScore} grade={passport.grade} />
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold text-ink-muted">Kerusakan</h2>
            <div className="mt-2">
              <DamageList damage={passport.damage} overallSeverity={passport.damageSeverity} />
            </div>
          </div>

          {passport.photos.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-ink-muted">Foto bukti</h2>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {passport.photos.map((photo) => (
                  <img key={photo.type} src={photo.signedUrl} alt={photo.type} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-black/8 pt-6">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="h-11 rounded-full border border-black/15 px-6 text-sm font-medium transition-colors duration-300 hover:border-black/40 disabled:opacity-70"
            >
              {verifying ? "Memverifikasi..." : "Verifikasi ulang"}
            </button>
            {verifyResult && (
              <p className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${VERIFY_LABELS[verifyResult].className}`}>
                {VERIFY_LABELS[verifyResult].label}
              </p>
            )}
            {verifyError && <p className="mt-3 text-xs text-red-500">{verifyError}</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
