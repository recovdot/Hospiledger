import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { isProfileMissing } from "@/components/auth/auth-field";
import { RegisterForm } from "@/components/auth/register-form";

const searchSchema = z.object({ email: z.string().optional() });

export const Route = createFileRoute("/register")({
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      try {
        await context.queryClient.ensureQueryData(trpc.profile.me.queryOptions());
      } catch (error) {
        if (isProfileMissing(error)) return;
        throw error;
      }
      throw redirect({ to: "/app" });
    }
  },
  component: RegisterForm,
});
