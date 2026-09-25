import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";

const NAV_BY_ROLE: Record<"seller" | "buyer" | "admin", { to: string; label: string }[]> = {
  seller: [{ to: "/seller", label: "Aset saya" }],
  buyer: [{ to: "/buyer", label: "Cari aset" }],
  admin: [{ to: "/app", label: "Pencatatan gagal" }],
};

export function DashboardShell({
  role,
  title,
  description,
  action,
  children,
}: {
  role: "seller" | "buyer" | "admin";
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const { data } = useQuery(trpc.profile.me.queryOptions());

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    await navigate({ to: "/login" });
  }

  const navLinks = NAV_BY_ROLE[role].map((item) => (
    <Link key={item.to} to={item.to} className="transition-colors hover:text-black" activeProps={{ className: "text-black font-medium" }}>
      {item.label}
    </Link>
  ));

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-black">
      <header className="border-b border-black/10 bg-canvas/90 px-5 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-lg font-bold tracking-tight">
              HospiLedger
            </Link>
            <nav className="hidden items-center gap-5 text-sm text-ink-muted md:flex">{navLinks}</nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {data && <span className="hidden text-ink-muted sm:inline">{data.profile.name}</span>}
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="max-sm:min-h-11 rounded-full border border-black/15 bg-transparent px-4 py-2 transition-colors duration-300 hover:border-black/40 disabled:opacity-70"
            >
              Keluar
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl items-center gap-5 pb-3 text-sm text-ink-muted md:hidden">{navLinks}</nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">{title}</h1>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          {action}
        </div>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
