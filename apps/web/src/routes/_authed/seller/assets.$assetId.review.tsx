import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_CONFIDENCE_FLAG_THRESHOLD, type DamageFinding, type DamageKind, type DamageSeverity, type SellerCorrections } from "@hospiledger/shared";
import { Field, FieldTextarea } from "@hospiledger/ui/components/field";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { StatusBadge } from "@/components/passport/status-badge";
import { ConditionScore } from "@/components/passport/condition-score";
import { DamageList } from "@/components/passport/damage-list";
import { PHOTO_TYPE_LABEL, formatRupiahRange } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/assets/$assetId/review")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: AssetReview,
});

const DAMAGE_KINDS: Array<{ value: DamageKind; label: string }> = [
  { value: "scratch", label: "Goresan" }, { value: "rust", label: "Karat" }, { value: "broken_component", label: "Komponen rusak" },
  { value: "dent", label: "Penyok" }, { value: "dirty", label: "Kondisi kotor" }, { value: "missing_parts", label: "Bagian hilang" },
];
const DAMAGE_SEVERITIES: Array<{ value: DamageSeverity; label: string }> = [
  { value: "low", label: "Ringan" }, { value: "medium", label: "Sedang" }, { value: "high", label: "Berat" },
];

function AssetReview() {
  const { assetId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = trpc.assets.get.queryOptions({ assetId });
  const { data, isLoading, isError, error: queryError } = useQuery(query);
  const submitReview = useMutation(trpc.reviews.submit.mutationOptions());
  const [mode, setMode] = useState<"choose" | "edit">("choose");
  const [damage, setDamage] = useState<DamageFinding[]>([]);
  const [error, setError] = useState<string>();

  if (isLoading) return <DashboardShell role="seller" title="Memuat review..."><p className="text-sm text-ink-muted">Memuat hasil inspeksi AI...</p></DashboardShell>;
  if (isError || !data || !data.passport) return <DashboardShell role="seller" title="Review tidak tersedia"><p className="text-sm text-red-700">{queryError instanceof Error ? queryError.message : "Passport tidak dapat dimuat. Coba lagi."}</p></DashboardShell>;

  const { asset, photos, passport, inspection } = data;
  const lowConfidence = inspection?.confidence != null && inspection.confidence < AI_CONFIDENCE_FLAG_THRESHOLD;
  const canReview = passport.status === "pending_review";
  const approved = passport.status === "approved" || passport.status === "published";

  async function acceptPassport() {
    setError(undefined);
    try {
      await submitReview.mutateAsync({ assetCode: passport.assetCode, decision: "accept" });
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyetujui passport.");
    }
  }

  async function saveCorrections(form: HTMLFormElement) {
    const formValues = new FormData(form);
    const optional = (field: string) => {
      const value = String(formValues.get(field) ?? "").trim();
      return value === "" ? null : value;
    };
    const yearText = String(formValues.get("year") ?? "").trim();
    const scoreText = String(formValues.get("conditionScore") ?? "").trim();
    const severity = String(formValues.get("damageSeverity") ?? "");
    const edits: SellerCorrections = {
      category: String(formValues.get("category") ?? "").trim(),
      brand: String(formValues.get("brand") ?? "").trim(),
      model: String(formValues.get("model") ?? "").trim(),
      serialNumber: optional("serialNumber"),
      capacity: optional("capacity"),
      location: optional("location"),
      previousUsage: optional("previousUsage"),
      year: yearText === "" ? null : Number(yearText),
      conditionScore: scoreText === "" ? undefined : Number(scoreText),
      grade: String(formValues.get("grade") ?? "").trim() || undefined,
      damageSeverity: severity === "" ? null : severity as DamageSeverity,
      damage,
    };
    setError(undefined);
    try {
      await submitReview.mutateAsync({ assetCode: passport.assetCode, decision: "edit", edits, notes: optional("notes") ?? undefined });
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
      setMode("choose");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan koreksi.");
    }
  }

  return (
    <DashboardShell role="seller" title="Review hasil inspeksi AI" description={`${asset.brand} ${asset.model} · ${passport.assetCode}`} action={<StatusBadge status={passport.status} />}>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="rounded-[28px] bg-card p-6 md:p-8">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Temuan asli AI</h2><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">Dihasilkan AI</span></div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-ink-muted">Merek terdeteksi</dt><dd className="font-medium">{inspection?.detectedBrand ?? "-"}</dd></div>
              <div><dt className="text-ink-muted">Model terdeteksi</dt><dd className="font-medium">{inspection?.detectedModel ?? "-"}</dd></div>
              <div><dt className="text-ink-muted">Nomor seri OCR</dt><dd className="font-medium">{inspection?.ocrResult?.serialNumber ?? "-"}</dd></div>
              <div><dt className="text-ink-muted">Keyakinan deteksi {lowConfidence && <span className="ml-1 text-amber-700">Perlu perhatian</span>}</dt><dd className="font-medium">{inspection?.confidence == null ? "-" : `${Math.round(inspection.confidence * 100)}%`}</dd></div>
              <div className="col-span-2"><dt className="text-ink-muted">Estimasi nilai</dt><dd className="font-medium">{inspection?.valueEstimate == null ? "Estimasi nilai belum tersedia karena data pasar belum tersedia" : `Perkiraan AI tanpa data pasar: ${formatRupiahRange(inspection.valueMin, inspection.valueMax, inspection.valueEstimate)}`}</dd></div>
            </dl>
            <div className="mt-6"><ConditionScore score={inspection?.conditionScore ?? null} grade={inspection?.grade ?? null} /></div>
            {inspection?.scoreComponents && <p className="mt-3 text-xs text-ink-muted">Rincian AI — fisik {inspection.scoreComponents.physical}, visual {inspection.scoreComponents.visual}, kelengkapan {inspection.scoreComponents.completeness}.</p>}
            <div className="mt-6"><DamageList damage={inspection?.damageResult ?? []} overallSeverity={inspection?.damageSeverity ?? null} /></div>
          </section>
          <section className="rounded-[28px] bg-card p-6 md:p-8"><h2 className="text-lg font-semibold">Foto bukti</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo) => <figure key={photo.id}><img src={photo.signedUrl} alt={`Foto ${PHOTO_TYPE_LABEL[photo.type]}`} loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" /><figcaption className="mt-1 text-xs text-ink-muted">{PHOTO_TYPE_LABEL[photo.type]}</figcaption></figure>)}</div></section>
        </div>
        <aside className="flex flex-col gap-4">
          {approved ? <section className="rounded-[28px] bg-card p-6"><p className="text-sm text-ink-muted">Keputusan penjual sudah tercatat. Data AI asli tetap tersedia sebagai provenance.</p><Link to="/seller/assets/$assetId/passport" params={{ assetId }} className="mt-4 inline-block text-sm font-medium text-brand-strong underline underline-offset-4">Lihat publikasi passport</Link></section>
            : !canReview ? <section className="rounded-[28px] bg-card p-6"><p className="text-sm text-ink-muted">{passport.status === "ai_failed" ? "Inspeksi AI gagal. Kembali ke detail aset untuk mengulang inspeksi." : "Passport sedang diproses. Kembali setelah status menjadi menunggu review."}</p></section>
              : mode === "choose" ? <section className="flex flex-col gap-3 rounded-[28px] bg-card p-6"><h2 className="text-base font-semibold">Keputusan Anda</h2><p className="text-sm text-ink-muted">Koreksi tersimpan terpisah. Setujui setelah semua informasi benar.</p><button type="button" onClick={acceptPassport} disabled={submitReview.isPending} className="h-11 rounded-full bg-brand text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-active disabled:opacity-70">Setujui passport</button><button type="button" onClick={() => { setDamage(inspection?.damageResult ?? []); setMode("edit"); }} className="h-11 rounded-full border border-border text-sm font-medium transition-colors duration-300 hover:border-foreground/40">Edit data</button>{error && <p className="text-xs text-red-700">{error}</p>}</section>
                : <form className="flex flex-col gap-4 rounded-[28px] bg-card p-6" onSubmit={(event) => { event.preventDefault(); void saveCorrections(event.currentTarget); }}><h2 className="text-base font-semibold">Koreksi penjual</h2><Field label="Kategori" name="category" defaultValue={asset.category} required /><Field label="Merek" name="brand" defaultValue={asset.brand} required /><Field label="Model" name="model" defaultValue={asset.model} required /><Field label="Nomor seri" name="serialNumber" defaultValue={asset.serialNumber ?? ""} /><Field label="Tahun" name="year" type="number" min="1900" max="2100" defaultValue={asset.year ?? ""} /><Field label="Kapasitas" name="capacity" defaultValue={asset.capacity ?? ""} /><Field label="Lokasi" name="location" defaultValue={asset.location ?? ""} /><FieldTextarea label="Penggunaan sebelumnya" name="previousUsage" defaultValue={asset.previousUsage ?? ""} /><Field label="Skor kondisi" name="conditionScore" type="number" min="0" max="100" defaultValue={inspection?.conditionScore ?? ""} /><Field label="Grade" name="grade" maxLength={3} defaultValue={inspection?.grade ?? ""} /><label className="flex flex-col gap-1.5 text-sm font-medium">Keparahan kerusakan<select name="damageSeverity" defaultValue={inspection?.damageSeverity ?? ""} className="h-11 rounded-xl border border-black/15 bg-transparent px-3 text-base"><option value="">Tidak ada</option>{DAMAGE_SEVERITIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><div><div className="flex items-center justify-between"><h3 className="text-sm font-medium">Temuan kerusakan</h3><button type="button" onClick={() => setDamage([...damage, { kind: "scratch", severity: "low", area: null, note: null }])} className="text-sm text-brand-strong">Tambah temuan</button></div>{damage.map((finding, index) => <div key={index} className="mt-3 grid gap-2 rounded-xl bg-muted p-3"><select value={finding.kind} onChange={(event) => setDamage(damage.map((entry, itemIndex) => itemIndex === index ? { ...entry, kind: event.target.value as DamageKind } : entry))} className="h-10 rounded-lg border border-black/15 bg-card px-2">{DAMAGE_KINDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select><select value={finding.severity} onChange={(event) => setDamage(damage.map((entry, itemIndex) => itemIndex === index ? { ...entry, severity: event.target.value as DamageSeverity } : entry))} className="h-10 rounded-lg border border-black/15 bg-card px-2">{DAMAGE_SEVERITIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select><input value={finding.area ?? ""} onChange={(event) => setDamage(damage.map((entry, itemIndex) => itemIndex === index ? { ...entry, area: event.target.value || null } : entry))} placeholder="Area" className="h-10 rounded-lg border border-black/15 bg-card px-2 text-sm" /><input value={finding.note ?? ""} onChange={(event) => setDamage(damage.map((entry, itemIndex) => itemIndex === index ? { ...entry, note: event.target.value || null } : entry))} placeholder="Catatan" className="h-10 rounded-lg border border-black/15 bg-card px-2 text-sm" /><button type="button" onClick={() => setDamage(damage.filter((_, itemIndex) => itemIndex !== index))} className="text-left text-sm text-red-700">Hapus temuan</button></div>)}</div><FieldTextarea label="Catatan penjual" name="notes" placeholder="Jelaskan konteks koreksi bila diperlukan" />{error && <p className="text-xs text-red-700">{error}</p>}<button type="submit" disabled={submitReview.isPending} className="h-11 rounded-full bg-brand text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-active disabled:opacity-70">Simpan koreksi</button><button type="button" onClick={() => setMode("choose")} className="h-11 rounded-full border border-border text-sm font-medium">Kembali tanpa menyimpan</button></form>}
        </aside>
      </div>
    </DashboardShell>
  );
}
