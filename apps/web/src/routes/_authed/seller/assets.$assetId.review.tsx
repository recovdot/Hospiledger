import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FieldTextarea } from "@hospiledger/ui/components/field";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { StatusBadge } from "@/components/passport/status-badge";
import { ConditionScore } from "@/components/passport/condition-score";
import { DamageList } from "@/components/passport/damage-list";
import { formatRupiahRange } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/assets/$assetId/review")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: AssetReview,
});

function AssetReview() {
  const { assetId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = trpc.assets.get.queryOptions({ assetId });
  const { data, isLoading } = useQuery(query);
  const submitReview = useMutation(trpc.reviews.submit.mutationOptions());

  const [mode, setMode] = useState<"choose" | "edit">("choose");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();

  if (isLoading || !data || !data.passport) {
    return (
      <DashboardShell role="seller" title="Memuat review...">
        <p className="text-sm text-ink-muted">Memuat...</p>
      </DashboardShell>
    );
  }

  const { asset, photos, passport, inspection } = data;
  const alreadyReviewed = passport.status !== "ai_complete";

  async function handleAccept() {
    setError(undefined);
    try {
      await submitReview.mutateAsync({ assetCode: passport!.assetCode, decision: "accept" });
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim review.");
    }
  }

  async function handleEditSubmit() {
    setError(undefined);
    if (!notes.trim()) {
      setError("Isi catatan perbaikan sebelum mengirim.");
      return;
    }
    try {
      await submitReview.mutateAsync({ assetCode: passport!.assetCode, decision: "edit", notes: notes.trim() });
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim review.");
    }
  }

  return (
    <DashboardShell
      role="seller"
      title="Review hasil inspeksi AI"
      description={`${asset.brand} ${asset.model} · ${passport.assetCode}`}
      action={<StatusBadge status={passport.status} />}
    >
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="rounded-[28px] bg-white p-6 md:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Hasil deteksi AI</h2>
              <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted">Dihasilkan AI</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-ink-muted">Merek terdeteksi</dt>
                <dd className="font-medium">{inspection?.detectedBrand ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Model terdeteksi</dt>
                <dd className="font-medium">{inspection?.detectedModel ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Estimasi nilai</dt>
                <dd className="font-medium">
                  {formatRupiahRange(inspection?.valueMin ?? null, inspection?.valueMax ?? null, inspection?.valueEstimate ?? null)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Keyakinan deteksi</dt>
                <dd className="font-medium">
                  {inspection?.confidence !== null && inspection?.confidence !== undefined ? `${Math.round(inspection.confidence * 100)}%` : "-"}
                </dd>
              </div>
            </dl>
            <div className="mt-6">
              <ConditionScore score={inspection?.conditionScore ?? null} grade={inspection?.grade ?? null} />
            </div>
            <div className="mt-6">
              <DamageList damage={inspection?.damageResult ?? []} overallSeverity={inspection?.damageSeverity ?? null} />
            </div>
          </section>

          <section className="rounded-[28px] bg-white p-6 md:p-8">
            <h2 className="text-lg font-semibold">Foto bukti</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <img key={photo.id} src={photo.signedUrl} alt={photo.type} className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {alreadyReviewed ? (
            <section className="rounded-[28px] bg-white p-6">
              <p className="text-sm text-ink-muted">Review sudah dikirim untuk passport ini.</p>
              <Link to="/seller/assets/$assetId/passport" params={{ assetId }} className="mt-4 inline-block text-sm font-medium text-brand-strong underline underline-offset-4">
                Lanjut ke publikasi passport
              </Link>
            </section>
          ) : mode === "choose" ? (
            <section className="flex flex-col gap-3 rounded-[28px] bg-white p-6">
              <h2 className="text-base font-semibold">Keputusan Anda</h2>
              <button
                type="button"
                onClick={handleAccept}
                disabled={submitReview.isPending}
                className="h-11 rounded-full bg-brand text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-strong disabled:opacity-70"
              >
                Terima hasil AI
              </button>
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="h-11 rounded-full border border-black/15 text-sm font-medium transition-colors duration-300 hover:border-black/40"
              >
                Edit data
              </button>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </section>
          ) : (
            <section className="flex flex-col gap-3 rounded-[28px] bg-white p-6">
              <h2 className="text-base font-semibold">Catatan perbaikan</h2>
              <FieldTextarea label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Jelaskan koreksi yang perlu dilakukan" />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleEditSubmit}
                  disabled={submitReview.isPending}
                  className="h-11 flex-1 rounded-full bg-brand text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-strong disabled:opacity-70"
                >
                  Kirim
                </button>
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="h-11 rounded-full border border-black/15 px-4 text-sm font-medium transition-colors duration-300 hover:border-black/40"
                >
                  Batal
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
