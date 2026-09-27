import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { isProfileMissing, isSessionExpired } from "@/components/auth/auth-field";

const searchSchema = z.object({
  code: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search, context }) => {
    if (search.error_description || !search.code) {
      throw redirect({
        to: "/login",
        search: { authError: "Login dengan Google gagal atau dibatalkan." },
      });
    }
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(search.code);
    if (exchangeError) {
      throw redirect({
        to: "/login",
        search: { authError: "Verifikasi Google gagal. Silakan coba lagi." },
      });
    }
    try {
      await context.queryClient.ensureQueryData(trpc.profile.me.queryOptions());
      throw redirect({ to: "/app" });
    } catch (profileError) {
      if (await isSessionExpired(profileError)) {
        await supabase.auth.signOut();
        throw redirect({ to: "/login", search: { authError: "Sesi berakhir. Silakan masuk kembali." } });
      }
      if (isProfileMissing(profileError)) {
        const { data } = await supabase.auth.getUser();
        throw redirect({ to: "/register", search: { email: data.user?.email ?? "" } });
      }
      throw profileError;
    }
  },
  component: () => null,
});
