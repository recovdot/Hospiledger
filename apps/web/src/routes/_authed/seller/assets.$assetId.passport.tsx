import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";

import { DashboardShell } from "@/components/dashboard/shell";
import { dashboardBeforeLoad } from "@/components/auth/dashboard-route";
import { StatusBadge } from "@/components/passport/status-badge";
import { ChainBadge } from "@/components/passport/chain-badge";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_authed/seller/assets/$assetId/passport")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: PassportPublish,
});

function PassportPublish() {
  const { assetId } = Route.useParams();
  const queryClient = useQueryClient();
  const assetQuery = trpc.assets.get.queryOptions({ assetId });
  const { data: assetData } = useQuery(assetQuery);
  const assetCode = assetData?.passport?.assetCode;

  const passportQuery = trpc.passports.get.queryOptions(
    { assetCode: assetCode ?? "" },
    { enabled: Boolean(assetCode) },
  );
  const { data: passportData } = useQuery(passportQuery);
  const publish = useMutation(trpc.passports.publish.mutationOptions());
  const retryAnchor = useMutation(trpc.passports.retryAnchor.mutationOptions());
  const [error, setError] = useState<string | undefined>();
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();

  const shareUrl = assetCode && typeof window !== "undefined" ? `${window.location.origin}/passport/${assetCode}` : undefined;

  useEffect(() => {
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, { margin: 1, width: 220, color: { dark: "#171717", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(undefined));
  }, [shareUrl]);

  async function handlePublish() {
    if (!assetCode) return;
    setError(undefined);
    try {
      await publish.mutateAsync({ assetCode });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assetQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: passportQuery.queryKey }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mempublikasikan passport.");
    }
  }

  async function handleRetry() {
    if (!assetCode) return;
    setError(undefined);
    try {
      await retryAnchor.mutateAsync({ assetCode });
      await queryClient.invalidateQueries({ queryKey: passportQuery.queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencoba ulang pencatatan.");
    }
  }

  if (!assetData?.passport) {
    return (
      <DashboardShell role="seller" title="Memuat...">
        <p className="text-sm text-ink-muted">Memuat...</p>
      </DashboardShell>
    );
  }

  const passport = passportData?.passport ?? assetData.passport;

  return (
    <DashboardShell
      role="seller"
      title="Publikasi passport"
      description={`${assetData.asset.brand} ${assetData.asset.model} · ${passport.assetCode}`}
      action={<StatusBadge status={passport.status} />}
    >
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 md:p-8">
          <h2 className="text-lg font-semibold">Status pencatatan Solana</h2>
          {passport.chain ? <ChainBadge chain={passport.chain} viewer="seller" /> : <p className="text-sm text-ink-muted">Belum dipublikasikan.</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          {passport.status === "approved" && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publish.isPending}
              className="h-11 w-fit rounded-full bg-brand px-6 text-sm font-medium text-white transition-colors duration-300 hover:bg-brand-strong disabled:opacity-70"
            >
              {publish.isPending ? "Memproses..." : "Publikasikan passport"}
            </button>
          )}

          {passport.chain?.chainStatus === "failed" && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retryAnchor.isPending}
              className="h-11 w-fit rounded-full border border-black/15 px-6 text-sm font-medium transition-colors duration-300 hover:border-black/40 disabled:opacity-70"
            >
              {retryAnchor.isPending ? "Mencoba ulang..." : "Coba lagi pencatatan"}
            </button>
          )}
        </section>

        {passport.status === "published" && shareUrl && (
          <section className="flex flex-col items-center gap-4 rounded-[28px] bg-white p-6 text-center">
            <h2 className="text-base font-semibold">Bagikan passport</h2>
            {qrDataUrl && <img src={qrDataUrl} alt="QR passport" className="h-40 w-40" />}
            <a href={`/passport/${passport.assetCode}`} className="break-all text-xs text-brand-strong underline underline-offset-4">
              {shareUrl}
            </a>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
