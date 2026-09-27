import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner } from "./auth-field";

/** Starts the Google OAuth PKCE flow; either navigates away to Google or throws. */
export async function startGoogleSignIn(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export function GoogleButton({ submitting }: { submitting: boolean }) {
  const [error, setError] = useState<string | undefined>();

  async function handleClick() {
    setError(undefined);
    try {
      await startGoogleSignIn();
    } catch {
      setError("Login dengan Google gagal. Silakan coba lagi.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={error} />}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="h-11 w-full rounded-full border border-border bg-card text-base text-foreground transition-colors duration-300 hover:bg-black/5 disabled:opacity-70"
      >
        Masuk dengan Google
      </button>
    </div>
  );
}
