import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REQUIRED_PHOTO_TYPES } from "@hospiledger/shared";
import type { PassportStatus } from "@hospiledger/shared";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { StatusBadge } from "@/components/passport/status-badge";
import { PhotoUploadSlot } from "@/components/passport/photo-upload";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/assets/$assetId/")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: AssetDetail,
});

const PROCESSING_STATUSES: readonly PassportStatus[] = ["ai_processing"];

function AssetDetail() {
  const { assetId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = trpc.assets.get.queryOptions({ assetId });
  const { data, isLoading } = useQuery({
    ...query,
    refetchInterval: (q) => (q.state.data?.passport && PROCESSING_STATUSES.includes(q.state.data.passport.status) ? 3000 : false),
  });
  const startInspection = useMutation(trpc.inspections.start.mutationOptions());

  if (isLoading || !data) {
    return (
      <DashboardShell role="seller" title="Memuat aset...">
        <p className="text-sm text-ink-muted">Memuat...</p>
      </DashboardShell>
    );
  }

  const { asset, photos, passport } = data;
  const hasAllRequired = REQUIRED_PHOTO_TYPES.every((type) => photos.some((photo) => photo.type === type && photo.qualityOk));
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
        <section className="rounded-[28px] bg-white p-6 md:p-8">
          <h2 className="text-lg font-semibold">Data peralatan</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field label="Kategori" value={asset.category} />
            <Field label="Tahun" value={asset.year?.toString() ?? "-"} />
            <Field label="Kapasitas" value={asset.capacity ?? "-"} />
            <Field label="Nomor seri" value={asset.serialNumber ?? "-"} />
            <Field label="Lokasi" value={asset.location ?? "-"} />
          </dl>
        </section>

        <section className="rounded-[28px] bg-white p-6 md:p-8">
          <h2 className="text-lg font-semibold">Foto bukti</h2>
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
              className="h-11 rounded-full bg-brand px-6 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-strong disabled:opacity-50"
            >
              {startInspection.isPending ? "Mengirim..." : "Kirim untuk inspeksi AI"}
            </button>
            {!hasAllRequired && <p className="mt-2 text-xs text-ink-muted">Unggah foto depan, samping, belakang, dan nameplate terlebih dahulu.</p>}
          </div>
        )}

        {passport?.status === "ai_processing" && (
          <p className="text-sm text-ink-muted">Inspeksi AI sedang berjalan, halaman ini akan diperbarui otomatis.</p>
        )}

        {passport?.status === "ai_complete" && (
          <Link
            to="/seller/assets/$assetId/review"
            params={{ assetId }}
            className="w-fit rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-strong"
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-black">{value}</dd>
    </div>
  );
}
