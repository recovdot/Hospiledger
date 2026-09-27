import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Field, FieldTextarea } from "@hospiledger/ui/components/field";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/new")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: NewAsset,
});

function NewAsset() {
  const navigate = useNavigate();
  const createAsset = useMutation(trpc.assets.create.mutationOptions());

  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [year, setYear] = useState("");
  const [capacity, setCapacity] = useState("");
  const [location, setLocation] = useState("");
  const [previousUsage, setPreviousUsage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!category.trim()) nextErrors.category = "Kategori wajib diisi.";
    if (!brand.trim()) nextErrors.brand = "Merek wajib diisi.";
    if (!model.trim()) nextErrors.model = "Model wajib diisi.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBanner(undefined);
    try {
      const { asset } = await createAsset.mutateAsync({
        category: category.trim(),
        brand: brand.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim() || undefined,
        year: year ? Number(year) : undefined,
        capacity: capacity.trim() || undefined,
        location: location.trim() || undefined,
        previousUsage: previousUsage.trim() || undefined,
      });
      await navigate({ to: "/seller/assets/$assetId", params: { assetId: asset.id } });
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Gagal membuat aset.");
    }
  }

  return (
    <DashboardShell role="seller" title="Buat aset baru" description="Isi data peralatan sebelum mengunggah foto bukti.">
      <form onSubmit={handleSubmit} className="max-w-2xl rounded-[28px] bg-card p-6 md:p-10">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kulkas komersial" error={errors.category} />
          <Field label="Merek" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Contoh: Gea" error={errors.brand} />
          <Field label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Nomor model" error={errors.model} />
          <Field label="Nomor seri (opsional)" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          <Field label="Tahun (opsional)" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          <Field label="Kapasitas (opsional)" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Contoh: 500L" />
          <Field label="Lokasi (opsional)" value={location} onChange={(e) => setLocation(e.target.value)} className="sm:col-span-2" />
        </div>
        <FieldTextarea
          label="Riwayat penggunaan (opsional)"
          value={previousUsage}
          onChange={(e) => setPreviousUsage(e.target.value)}
          placeholder="Ceritakan riwayat pemakaian aset ini"
          className="mt-5"
        />
        {banner && <p className="mt-4 text-sm text-red-700">{banner}</p>}
        <button
          type="submit"
          disabled={createAsset.isPending}
          className="mt-6 h-11 rounded-full bg-brand px-6 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-active disabled:opacity-70"
        >
          {createAsset.isPending ? "Menyimpan..." : "Buat aset"}
        </button>
      </form>
    </DashboardShell>
  );
}
