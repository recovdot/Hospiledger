import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { SelfSelectableRole } from "@hospiledger/shared";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { isProfileMissing } from "@/components/auth/auth-field";

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
  component: AdminFallback,
});

function AdminFallback() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f1f1f1] text-black">
      <p className="text-sm text-[#6c6b6b]">HospiLedger</p>
      <p className="text-lg font-medium">Dashboard untuk peran admin belum tersedia.</p>
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          await navigate({ to: "/login" });
        }}
        className="rounded-full bg-[#b154f9] px-6 py-3 text-white transition-colors hover:bg-[#a53df5]"
      >
        Keluar
      </button>
    </div>
  );
}
