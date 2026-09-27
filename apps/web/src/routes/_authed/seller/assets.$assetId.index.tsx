import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REQUIRED_PHOTO_TYPES } from "@hospiledger/shared";
import type { PassportStatus } from "@hospiledger/shared";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { StatusBadge } from "@/components/passport/status-badge";
import { PhotoUploadSlot } from "@/components/passport/photo-upload";
import { Progress } from "@hospiledger/ui/components/progress";
import { CheckCircle2 } from "lucide-react";
import { PHOTO_TYPE_LABEL } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/assets/$assetId/")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: AssetDetail,
});

const PROCESSING_STATUSES: readonly PassportStatus[] = ["submitted", "ai_processing"];

function AssetDetail() {
  const { assetId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = trpc.assets.get.queryOptions({ assetId });
  const { data, isLoading, isError, error } = useQuery({
    ...query,
    refetchInterval: (assetQueryState) => (assetQueryState.state.data?.passport && PROCESSING_STATUSES.includes(assetQueryState.state.data.passport.status) ? 3000 : false),
  });
  const startInspection = useMutation(trpc.inspections.start.mutationOptions());

  if (isLoading) {
    return <DashboardShell role="seller" title="Memuat aset..."><p className="text-sm text-ink-muted">Memuat aset...</p></DashboardShell>;
  }
  if (isError || !data) {
    return <DashboardShell role="seller" title="Aset tidak tersedia"><p className="text-sm text-red-700">{error instanceof Error ? error.message : "Aset tidak dapat dimuat. Coba lagi."}</p></DashboardShell>;
  }

  const { asset, photos, passport } = data;
  const missingTypes = REQUIRED_PHOTO_TYPES.filter((type) => !photos.some((photo) => photo.type === type && photo.qualityOk));
  const hasAllRequired = missingTypes.length === 0;
  const canSubmit = passport?.status === "draft" || passport?.status === "ai_failed";

  async function handleSubmitInspection() {
    await startInspection.mutateAsync({ assetId });
    await queryClient.invalidateQueries({ queryKey: query.queryKey });
  }

  return (
    <DashboardShell
      role="seller"
      title={`${asset.brand} ${asset.model}`}
      description={passport?.assetCode ?? "Belum ada kode aset"}
      action={passport ? <StatusBadge status={passport.status} /> : undefined}
    >
      <div className="flex flex-col gap-8">
        <section className="rounded-[28px] bg-card p-6 md:p-8">
          <h2 className="text-lg font-semibold">Data peralatan</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field label="Kategori" value={asset.category} />
            <Field label="Tahun" value={asset.year?.toString() ?? "-"} />
            <Field label="Kapasitas" value={asset.capacity ?? "-"} />
            <Field label="Nomor seri" value={asset.serialNumber ?? "-"} />
            <Field label="Lokasi" value={asset.location ?? "-"} />
          </dl>
        </section>

        <section className="rounded-[28px] bg-card p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Foto bukti</h2>
            {hasAllRequired ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Foto lengkap
              </span>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {missingTypes.length} foto wajib belum valid
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">Unggah foto asli dan jelas yang menunjukkan kondisi sebenarnya.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(["front", "side", "back", "nameplate", "damage"] as const).map((type) => (
              <PhotoUploadSlot
                key={type}
                assetId={assetId}
                type={type}
                photo={photos.find((photo) => photo.type === type)}
                disabled={!canSubmit}
              />
            ))}
          </div>
        </section>

        {canSubmit && (
          <div>
            <button
              type="button"
              onClick={handleSubmitInspection}
              disabled={!hasAllRequired || startInspection.isPending}
              className="h-11 rounded-full bg-brand px-6 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-active disabled:opacity-50"
            >
              {startInspection.isPending ? "Mengirim..." : "Kirim untuk inspeksi AI"}
            </button>
            {!hasAllRequired && (
              <p className="mt-2 text-xs text-ink-muted">
                Wajib: {missingTypes.map((type) => PHOTO_TYPE_LABEL[type]).join(", ")}.
              </p>
            )}
          </div>
        )}

        {passport?.status === "ai_failed" && (
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-medium">Inspeksi AI gagal.</p>
            <p className="mt-1">{data.inspection?.failureReason ?? "Silakan ulangi inspeksi atau hubungi dukungan."}</p>
          </div>
        )}

        {passport && PROCESSING_STATUSES.includes(passport.status) && (
          <InspectionProgressPanel
            progress={data.inspection?.progress ?? null}
            inspectionStatus={data.inspection?.status ?? null}
          />
        )}

        {passport?.status === "ai_complete" && (
          <Link
            to="/seller/assets/$assetId/review"
            params={{ assetId }}
            className="w-fit rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-active"
          >
            Lihat hasil inspeksi AI
          </Link>
        )}

        {(passport?.status === "pending_review" || passport?.status === "approved" || passport?.status === "published") && (
          <Link
            to="/seller/assets/$assetId/review"
            params={{ assetId }}
            className="w-fit text-sm font-medium text-brand-strong underline underline-offset-4"
          >
            Lihat review dan status passport
          </Link>
        )}
      </div>
    </DashboardShell>
  );
}

/** Progress steps shown while the AI pipeline runs; each reflects persisted worker state. */
function InspectionProgressPanel({
  progress,
  inspectionStatus,
}: {
  progress: { stage: "recognition" | "assessment"; done: number; total: number } | null;
  inspectionStatus: "processing" | "complete" | "failed" | null;
}) {
  const steps = [
    { key: "validated", label: "Validasi foto", done: true },
    { key: "recognition", label: "Pemeriksaan foto", done: (progress?.done ?? 0) >= (progress?.total ?? 0) - 1 },
    { key: "assessment", label: "Skor kondisi dan estimasi nilai", done: false },
  ];
  const waiting = inspectionStatus === "processing" && progress === null;
  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const stageLabel = waiting
    ? "Menunggu pemrosesan dimulai..."
    : progress?.stage === "assessment"
      ? "Menghitung skor kondisi dan estimasi nilai..."
      : "Memeriksa foto dengan AI...";

  return (
    <section className="rounded-[28px] bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold">Inspeksi AI sedang berjalan</p>
        <span className="text-sm font-medium tabular-nums text-brand-strong" aria-live="polite">
          {waiting ? "..." : `${percent}%`}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{stageLabel} Halaman ini diperbarui otomatis tanpa perlu menyegarkan.</p>
      <div className="mt-5">
        {waiting ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar">
            <div className="h-full w-1/4 animate-pulse rounded-full bg-brand/40" />
          </div>
        ) : (
          <Progress value={percent} aria-label="Progres inspeksi AI" />
        )}
      </div>
      <ol className="mt-4 flex flex-col gap-2 text-sm">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3 text-ink-muted">
            {step.done ? (
              <CheckCircle2 aria-hidden="true" className="size-4 text-brand-strong" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-brand/40" aria-hidden="true" />
            )}
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
