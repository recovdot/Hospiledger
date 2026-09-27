import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { ErrorBanner, isProfileMissing, localizeAuthError } from "./auth-field";

/** Signs in a ready-made profile, then routes like the email/password form does. */
export function DemoLoginButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | undefined>();

  async function handleClick() {
    setBanner(undefined);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: import.meta.env.VITE_DEMO_EMAIL,
        password: import.meta.env.VITE_DEMO_PASSWORD,
      });
      if (error) {
        setBanner(localizeAuthError(error.message));
        return;
      }
      try {
        await queryClient.ensureQueryData(trpc.profile.me.queryOptions());
        await navigate({ to: "/app" });
      } catch (profileError) {
        if (isProfileMissing(profileError)) {
          await navigate({
            to: "/register",
            search: { email: import.meta.env.VITE_DEMO_EMAIL },
            replace: true,
          });
          return;
        }
        throw profileError;
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {banner && <ErrorBanner message={banner} />}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="h-11 w-full rounded-full border border-border bg-card text-base text-foreground transition-colors duration-300 hover:bg-black/5 disabled:opacity-70"
      >
        Masuk dengan demo
      </button>
    </div>
  );
}
