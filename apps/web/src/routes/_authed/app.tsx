import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SelfSelectableRole } from "@hospiledger/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@hospiledger/ui/components/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@hospiledger/ui/components/empty";

import { trpc } from "@/utils/trpc";
import { isProfileMissing } from "@/components/auth/auth-field";
import { DashboardShell } from "@/components/dashboard/shell";
import { formatDate } from "@/lib/format";

const DASHBOARD_FOR: Record<Exclude<SelfSelectableRole, "admin">, "/seller" | "/buyer" | "/inspector"> = {
  seller: "/seller",
  buyer: "/buyer",
  inspector: "/inspector",
};

export const Route = createFileRoute("/_authed/app")({
  beforeLoad: async ({ context }) => {
    try {
      const { profile } = await context.queryClient.ensureQueryData(trpc.profile.me.queryOptions());
      if (profile.role !== "admin") {
        throw redirect({ to: DASHBOARD_FOR[profile.role] });
      }
    } catch (error) {
      if (isProfileMissing(error)) {
        throw redirect({ to: "/register" });
      }
      throw error;
    }
  },
  component: AdminFailedAnchors,
});

function AdminFailedAnchors() {
  const queryClient = useQueryClient();
  const query = trpc.admin.failedAnchors.queryOptions();
  const { data, isLoading } = useQuery(query);
  const retryAnchor = useMutation(trpc.passports.retryAnchor.mutationOptions());

  async function handleRetry(assetCode: string) {
    await retryAnchor.mutateAsync({ assetCode });
    await queryClient.invalidateQueries({ queryKey: query.queryKey });
  }

  return (
    <DashboardShell role="admin" title="Pencatatan Solana gagal" description="Passport yang gagal dicatat setelah percobaan berulang.">
      <div className="rounded-[28px] bg-card p-2">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-muted">Memuat...</p>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Tidak ada pencatatan yang gagal</EmptyTitle>
              <EmptyDescription>Semua passport tercatat di Solana dengan lancar.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent />
          </Empty>
        ) : (
          <>
            <ul className="divide-y divide-black/8 sm:hidden">
              {data.items.map((item) => (
                <li key={item.recordId} className="flex items-center justify-between gap-3 px-4 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.brand} {item.model}
                    </p>
                    <p className="text-xs text-ink-muted">{item.category}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      <span className="font-mono">{item.assetCode}</span> · {formatDate(item.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRetry(item.assetCode)}
                    disabled={retryAnchor.isPending}
                    className="min-h-11 min-w-11 shrink-0 rounded-full border border-border px-4 text-xs font-medium transition-colors duration-300 hover:border-foreground/40 disabled:opacity-70"
                  >
                    Coba lagi
                  </button>
                </li>
              ))}
            </ul>
            <Table className="hidden sm:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Kode aset</TableHead>
                  <TableHead>Peralatan</TableHead>
                  <TableHead>Gagal sejak</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.recordId}>
                    <TableCell className="font-mono text-xs">{item.assetCode}</TableCell>
                    <TableCell>
                      {item.brand} {item.model}
                      <p className="text-xs text-ink-muted">{item.category}</p>
                    </TableCell>
                    <TableCell className="text-xs text-ink-muted">{formatDate(item.updatedAt)}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleRetry(item.assetCode)}
                        disabled={retryAnchor.isPending}
                        className="min-h-11 min-w-11 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-300 hover:border-foreground/40 disabled:opacity-70"
                      >
                        Coba lagi
                      </button>
                    </TableCell>
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
