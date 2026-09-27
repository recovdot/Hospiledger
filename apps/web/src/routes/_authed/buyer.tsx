import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@hospiledger/ui/components/empty";
import { Field } from "@hospiledger/ui/components/field";
import { ASSET_CODE_PATTERN } from "@hospiledger/shared";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { formatRupiahRange } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/buyer")({
  beforeLoad: dashboardBeforeLoad("buyer"),
  component: BuyerSearch,
});

function BuyerSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [assetCodeInput, setAssetCodeInput] = useState("");
  const [assetCodeError, setAssetCodeError] = useState<string | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError, error } = useQuery(
    trpc.publicPassports.list.queryOptions({ q: debounced || undefined, limit: 24, offset: 0 }),
  );

  function handleAssetCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const assetCode = assetCodeInput.trim();
    if (!ASSET_CODE_PATTERN.test(assetCode)) {
      setAssetCodeError("Kode aset tidak valid. Format: HPL-2026-00001.");
      return;
    }
    setAssetCodeError(undefined);
    void navigate({ to: "/passport/$assetCode", params: { assetCode } });
  }

  return (
    <DashboardShell role="buyer" title="Cari aset" description="Jelajahi passport yang sudah dipublikasikan atau buka langsung lewat kode aset.">
      <div className="flex flex-col gap-6">
        <form
          role="search"
          onSubmit={handleAssetCodeSubmit}
          className="grid gap-4 rounded-[28px] bg-card p-6 sm:grid-cols-[2fr_1fr_auto] sm:items-end md:items-end"
        >
          <Field
            label="Cari kategori, merek, atau model"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: kulkas, Gea"
            inputClassName="rounded-full"
          />
          <Field
            id="buyer-asset-code"
            label="Buka via kode aset"
            value={assetCodeInput}
            onChange={(e) => {
              setAssetCodeInput(e.target.value.toUpperCase());
              if (assetCodeError) setAssetCodeError(undefined);
            }}
            placeholder="HPL-2026-00001"
            error={assetCodeError}
            inputClassName="rounded-full"
          />
          <button
            type="submit"
            className="h-11 rounded-full bg-brand px-6 text-center text-sm text-white transition-colors duration-300 hover:bg-brand-active"
          >
            Buka
          </button>
        </form>

        {isLoading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : isError ? (
          <p className="text-sm text-red-700">{error instanceof Error ? error.message : "Passport tidak dapat dimuat. Coba lagi."}</p>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Tidak ada passport ditemukan</EmptyTitle>
              <EmptyDescription>Coba kata kunci lain, atau buka langsung lewat kode aset.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent />
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <Link
                key={item.assetCode}
                to="/passport/$assetCode"
                params={{ assetCode: item.assetCode }}
                className="flex flex-col overflow-hidden rounded-[28px] bg-card transition-transform hover:-translate-y-1"
              >
                {item.coverPhotoUrl ? (
                  <img src={item.coverPhotoUrl} alt={item.model} className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full bg-muted" />
                )}
                <div className="flex flex-col gap-1 p-5">
                  <p className="font-mono text-xs text-ink-muted">{item.assetCode}</p>
                  <p className="font-medium">
                    {item.brand} {item.model}
                  </p>
                  <p className="text-xs text-ink-muted">{item.category}</p>
                  <p className="mt-2 text-sm font-medium text-brand-strong">
                    {formatRupiahRange(item.valueMin, item.valueMax, item.valueEstimate)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
