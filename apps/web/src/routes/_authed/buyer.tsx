import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [assetCodeInput, setAssetCodeInput] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery(
    trpc.publicPassports.list.queryOptions({ q: debounced || undefined, limit: 24, offset: 0 }),
  );

  return (
    <DashboardShell role="buyer" title="Cari aset" description="Jelajahi passport yang sudah dipublikasikan atau buka langsung lewat kode aset.">
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 rounded-[28px] bg-white p-6 md:grid-cols-[2fr_1fr_auto] md:items-end">
          <Field
            label="Cari kategori, merek, atau model"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: kulkas, Gea"
            inputClassName="rounded-full"
          />
          <Field
            label="Buka via kode aset"
            value={assetCodeInput}
            onChange={(e) => setAssetCodeInput(e.target.value.toUpperCase())}
            placeholder="HPL-2026-00001"
            inputClassName="rounded-full"
          />
          <Link
            to="/passport/$assetCode"
            params={{ assetCode: assetCodeInput }}
            className="h-11 rounded-full bg-brand px-6 text-center text-sm leading-[2.75rem] text-white transition-colors duration-300 hover:bg-brand-strong aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={!ASSET_CODE_PATTERN.test(assetCodeInput)}
          >
            Buka
          </Link>
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
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
                className="flex flex-col overflow-hidden rounded-[28px] bg-white transition-transform hover:-translate-y-1"
              >
                {item.coverPhotoUrl ? (
                  <img src={item.coverPhotoUrl} alt={item.model} className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full bg-canvas" />
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
