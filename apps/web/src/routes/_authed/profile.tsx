import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { DashboardShell } from "@/components/dashboard/shell";
import { formatDate } from "@/lib/format";
import { profileBeforeLoad } from "@/components/auth/dashboard-route";

const ROLE_LABELS: Record<string, string> = {
  seller: "Seller",
  buyer: "Buyer",
  inspector: "Inspector",
  admin: "Admin",
};

export const Route = createFileRoute("/_authed/profile")({
  beforeLoad: profileBeforeLoad,
  component: ProfilePage,
});

function ProfilePage() {
  const query = trpc.profile.me.queryOptions();
  const { data, isLoading, isError, error } = useQuery(query);
  const [email, setEmail] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setEmail(user?.email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const roleLabel = data ? ROLE_LABELS[data.profile.role] ?? data.profile.role : "";

  return (
    <DashboardShell role={data?.profile.role ?? "seller"} title="Profil" description="Data akun Anda di HospiLedger.">
      <div className="max-w-md rounded-[28px] bg-card p-6 md:p-8">
        {isLoading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : isError || !data ? (
          <p className="text-sm text-red-700">{error instanceof Error ? error.message : "Profil tidak dapat dimuat. Coba lagi."}</p>
        ) : (
          <dl className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-muted">Nama</dt>
              <dd className="text-right font-medium">{data.profile.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-muted">Email</dt>
              <dd className="text-right font-medium break-all">{email ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-muted">Perusahaan</dt>
              <dd className="text-right font-medium">{data.company?.name ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-muted">Telepon</dt>
              <dd className="text-right font-medium">{data.profile.phone ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-muted">Peran</dt>
              <dd className="rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong">
                {roleLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-black/8 pt-4">
              <dt className="text-ink-muted">Bergabung</dt>
              <dd className="font-medium">{formatDate(data.profile.createdAt)}</dd>
            </div>
          </dl>
        )}
      </div>
    </DashboardShell>
  );
}
