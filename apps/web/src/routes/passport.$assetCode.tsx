import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import type { VerificationResult } from "@hospiledger/shared";

import { ConditionScore } from "@/components/passport/condition-score";
import { DamageList } from "@/components/passport/damage-list";
import { ChainBadge } from "@/components/passport/chain-badge";
import { PHOTO_TYPE_LABEL, formatDate, formatRupiahRange } from "@/lib/format";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/passport/$assetCode")({
  component: PublicPassportPage,
});

const VERIFY_LABELS: Record<VerificationResult, { label: string; className: string }> = {
  match: { label: "Terverifikasi: data cocok dengan Solana", className: "bg-brand/10 text-brand-strong" },
  mismatch: { label: "Peringatan: data tidak cocok dengan Solana", className: "bg-red-50 text-red-600" },
  pending: { label: "Pencatatan masih diproses", className: "bg-muted text-ink-muted" },
  not_found: { label: "Transaksi tidak ditemukan di Solana", className: "bg-red-50 text-red-600" },
  unreachable: { label: "Tidak dapat menghubungi jaringan Solana, coba lagi", className: "bg-muted text-ink-muted" },
};

function PublicPassportPage() {
  const { assetCode } = Route.useParams();
  const { data, isLoading, error } = useQuery(trpc.publicPassports.getByCode.queryOptions({ assetCode }));
  const [userVerifyResult, setUserVerifyResult] = useState<VerificationResult | undefined>();
  const [verifyError, setVerifyError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);

  function isSellerEdited(field: string): boolean {
    return Object.hasOwn(data?.passport.sellerEdits ?? {}, field);
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(undefined);
    try {
      const result = await trpcClient.publicPassports.verify.query({ assetCode });
      setUserVerifyResult(result.verification.result);
    } catch (e) {
      setVerifyError(isTRPCClientError(e) ? e.message : "Gagal memverifikasi.");
    } finally {
      setVerifying(false);
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-muted text-sm text-ink-muted">Memuat...</div>;
  }

  if (error || !data) {
    const notFound = isTRPCClientError(error) && error.data?.code === "NOT_FOUND";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted px-5 text-center">
        <p className="text-lg font-medium text-foreground">{notFound ? "Passport tidak ditemukan." : "Passport tidak dapat dimuat."}</p>
        <p className="text-sm text-ink-muted">{notFound ? "Pastikan tautan passport benar atau minta tautan terbaru dari penjual." : "Terjadi gangguan saat memuat passport. Coba lagi."}</p>
        <Link to="/" className="text-sm text-brand-strong underline underline-offset-4">Kembali ke beranda</Link>
      </div>
    );
  }

  const { passport } = data;
  const activeVerifyResult = userVerifyResult ?? passport.verification.result;

  return (
    <div className="min-h-screen bg-muted text-foreground">
      <header className="border-b border-black/10 px-5">
        <div className="mx-auto flex h-[72px] max-w-3xl items-center">
          <Link to="/" className="text-lg font-bold tracking-tight">
            HospiLedger
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-[28px] bg-card p-6 md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-ink-muted">{passport.assetCode}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{passport.brand} {passport.model}</h1>
              <p className="text-sm text-ink-muted">{passport.category}</p>
              {(isSellerEdited("category") || isSellerEdited("brand") || isSellerEdited("model")) && <p className="mt-1 text-xs text-brand-strong">Identitas diperbaiki penjual</p>}
            </div>
            <ChainBadge chain={passport.chain} viewer="public" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-ink-muted">Estimasi nilai</dt><dd className="mt-0.5 font-medium">{passport.valueEstimate == null ? "Estimasi nilai belum tersedia karena data pasar belum tersedia" : `Perkiraan AI tanpa data pasar: ${formatRupiahRange(passport.valueMin, passport.valueMax, passport.valueEstimate)}`}</dd></div>
            <div><dt className="text-ink-muted">Nomor seri {isSellerEdited("serialNumber") && <span className="ml-1 text-brand-strong">Diperbaiki penjual</span>}</dt><dd className="mt-0.5 font-medium">{passport.serialNumber ?? "-"}</dd></div>
            <div><dt className="text-ink-muted">Kapasitas {isSellerEdited("capacity") && <span className="ml-1 text-brand-strong">Diperbaiki penjual</span>}</dt><dd className="mt-0.5 font-medium">{passport.capacity ?? "-"}</dd></div>
            <div><dt className="text-ink-muted">Lokasi {isSellerEdited("location") && <span className="ml-1 text-brand-strong">Diperbaiki penjual</span>}</dt><dd className="mt-0.5 font-medium">{passport.location ?? "-"}</dd></div>
            <div><dt className="text-ink-muted">Penggunaan sebelumnya {isSellerEdited("previousUsage") && <span className="ml-1 text-brand-strong">Diperbaiki penjual</span>}</dt><dd className="mt-0.5 font-medium">{passport.previousUsage ?? "-"}</dd></div>
            <div><dt className="text-ink-muted">Dipublikasikan</dt><dd className="mt-0.5 font-medium">{formatDate(passport.publishedAt)}</dd></div>
          </div>
          {passport.sellerCompanyName && <p className="mt-4 text-sm text-ink-muted">Perusahaan penjual: <span className="font-medium text-foreground">{passport.sellerCompanyName}</span> <span className="text-xs">(tercantum saat pendaftaran; bukan data terverifikasi chain)</span></p>}

          {passport.sellerNotes && (
            <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-ink-muted">Catatan penjual: {passport.sellerNotes}</p>
          )}

          <div className="mt-8">
            <ConditionScore score={passport.conditionScore} grade={passport.grade} />
          </div>
          {passport.scoreComponents && <p className="mt-3 text-xs text-ink-muted">Rincian kondisi oleh AI — fisik {passport.scoreComponents.physical}, visual {passport.scoreComponents.visual}, kelengkapan {passport.scoreComponents.completeness}. Skor keseluruhan dapat dikoreksi penjual.</p>}

          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-ink-muted">Integritas</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${VERIFY_LABELS[activeVerifyResult].className}`}>
                {VERIFY_LABELS[activeVerifyResult].label}
              </p>
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                className="h-11 rounded-full border border-border px-6 text-sm font-medium transition-colors duration-300 hover:border-foreground/40 disabled:opacity-70"
              >
                {verifying ? "Memverifikasi..." : "Verifikasi ulang"}
              </button>
            </div>
            {verifyError && <p className="mt-3 text-xs text-red-700">{verifyError}</p>}
            <p className="mt-3 text-xs text-ink-muted">
              Verifikasi menghitung ulang hash isi passport dan membandingkannya dengan hash di memo Solana.
            </p>
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
                  <figure key={photo.type} className="flex flex-col gap-1">
                    <img
                      src={photo.signedUrl}
                      alt={`Foto ${PHOTO_TYPE_LABEL[photo.type]}`}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                    <figcaption className="text-xs text-ink-muted">{PHOTO_TYPE_LABEL[photo.type]}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
