import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@hospiledger/ui/components/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@hospiledger/ui/components/empty";

import { DashboardShell } from "@/components/dashboard/shell";
import { StatusBadge } from "@/components/passport/status-badge";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { formatDate } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: SellerAssetList,
});

function SellerAssetList() {
  const { data, isLoading, isError, error } = useQuery(trpc.assets.list.queryOptions({ limit: 50, offset: 0 }));

  return (
    <DashboardShell
      role="seller"
      title="Aset saya"
      description="Kelola aset, pantau status inspeksi, dan publikasikan passport."
      action={
        <Link
          to="/seller/new"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-active"
        >
          Buat aset baru
        </Link>
      }
    >
      <div className="rounded-[28px] bg-card p-2">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-muted">Memuat...</p>
        ) : isError ? (
          <p className="p-6 text-sm text-red-700">{error instanceof Error ? error.message : "Daftar aset tidak dapat dimuat. Coba lagi."}</p>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Belum ada aset</EmptyTitle>
              <EmptyDescription>Buat aset pertama untuk mulai proses inspeksi AI dan penerbitan passport.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link to="/seller/new" className="text-sm font-medium text-brand-strong underline underline-offset-4">
                Buat aset baru
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ul className="divide-y divide-black/8 sm:hidden">
              {data.items.map((item) => (
                <li key={item.asset.id}>
                  <Link to="/seller/assets/$assetId" params={{ assetId: item.asset.id }} className="flex flex-col gap-2 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {item.asset.brand} {item.asset.model}
                        </p>
                        <p className="text-xs text-ink-muted">{item.asset.category}</p>
                      </div>
                      {item.passportStatus && <StatusBadge status={item.passportStatus} className="shrink-0" />}
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-ink-muted">
                      <span className="font-mono">{item.assetCode ?? "-"}</span>
                      <span>{formatDate(item.asset.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Table className="hidden sm:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Kode aset</TableHead>
                  <TableHead>Peralatan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.asset.id}>
                    <TableCell className="font-mono text-xs">{item.assetCode ?? "-"}</TableCell>
                    <TableCell>
                      <Link to="/seller/assets/$assetId" params={{ assetId: item.asset.id }} className="font-medium hover:underline">
                        {item.asset.brand} {item.asset.model}
                      </Link>
                      <p className="text-xs text-ink-muted">{item.asset.category}</p>
                    </TableCell>
                    <TableCell>{item.passportStatus ? <StatusBadge status={item.passportStatus} /> : "-"}</TableCell>
                    <TableCell className="text-xs text-ink-muted">{formatDate(item.asset.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
