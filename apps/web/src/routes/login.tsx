import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { LoginForm } from "@/components/auth/login-form";

const searchSchema = z.object({
  authError: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/app" });
    }
  },
  component: () => <LoginForm authError={Route.useSearch().authError} />,
});
