import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { GoogleButton } from "./google-button";
import { AuthField, AuthLayout, ErrorBanner, SubmitButton, isProfileMissing, localizeAuthError, trpcErrorCode } from "./auth-field";

const DemoLoginButton = import.meta.env.DEV
  ? lazy(() => import("./demo-login").then(({ DemoLoginButton }) => ({ default: DemoLoginButton })))
  : null;

export function LoginForm({ authError }: { authError?: string } = {}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | undefined>(authError);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(undefined);
    setPasswordError(undefined);
    setBanner(undefined);
    if (!email) {
      setEmailError("Email wajib diisi.");
      return;
    }
    if (!password) {
      setPasswordError("Kata sandi wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setBanner(localizeAuthError(error.message));
        setSubmitting(false);
        return;
      }
      try {
        await router.options.context.queryClient.ensureQueryData(
          trpc.profile.me.queryOptions(),
        );
        await navigate({ to: "/app" });
      } catch (profileError) {
        if (isProfileMissing(profileError)) {
          await navigate({ to: "/register", search: { email }, replace: true });
          return;
        }
        throw profileError;
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          Belum punya akun?{" "}
          <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
            Daftar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Masuk</h1>
          <p className="mt-1 text-sm text-ink-muted">Masuk ke akun HospiLedger Anda.</p>
        </div>
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="nama@perusahaan.com"
          error={emailError}
          autoComplete="email"
        />
        <AuthField
          id="login-password"
          label="Kata sandi"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          error={passwordError}
          autoComplete="current-password"
        />
        {banner && <ErrorBanner message={banner} />}
        <SubmitButton submitting={submitting}>Masuk</SubmitButton>
        <div className="flex items-center gap-4 text-sm text-ink-muted">
          <span className="h-px flex-1 bg-border" />
          atau
          <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleButton submitting={submitting} />
        {DemoLoginButton &&
          import.meta.env.VITE_DEMO_LOGIN === "true" &&
          import.meta.env.VITE_DEMO_EMAIL &&
          import.meta.env.VITE_DEMO_PASSWORD && (
            <Suspense fallback={null}>
              <DemoLoginButton />
            </Suspense>
          )}
      </form>
    </AuthLayout>
  );
}
