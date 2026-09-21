import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export function RoleDashboard({
  role,
  profile,
  email,
}: {
  role: "seller" | "buyer" | "inspector";
  profile: { name: string; companyName: string };
  email: string;
}) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    await navigate({ to: "/login" });
  }

  const headings = {
    seller: "Dashboard Seller",
    buyer: "Dashboard Buyer",
    inspector: "Dashboard Inspector",
  } as const;

  return (
    <div className="flex min-h-screen flex-col bg-[#f1f1f1] text-black">
      <header className="border-b border-black/10 bg-[#f1f1f1]/90 px-5 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight">
            HospiLedger
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#6c6b6b]">{profile.name}</span>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="rounded-full border border-black/15 bg-transparent px-4 py-2 transition-colors duration-300 hover:border-black/40 disabled:opacity-70"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">{headings[role]}</h1>
        <div className="mt-6 max-w-md rounded-[28px] bg-white p-8">
          <dl className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#6c6b6b]">Nama</dt>
              <dd className="font-medium">{profile.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#6c6b6b]">Perusahaan</dt>
              <dd className="font-medium">{profile.companyName}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#6c6b6b]">Email</dt>
              <dd className="font-medium">{email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#6c6b6b]">Peran</dt>
              <dd className="rounded-full border border-[#b154f9] bg-[#b154f9]/10 px-3 py-1 text-xs font-medium text-[#a53df5]">
                {role}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
