import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { AuthField, AuthLayout, ErrorBanner, SubmitButton, isProfileMissing, localizeAuthError, trpcErrorCode } from "./auth-field";

export function LoginForm() {
  const router = useRouter();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | undefined>();
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
          <Link to="/register" className="font-medium text-black underline underline-offset-4">
            Daftar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Masuk</h1>
          <p className="mt-1 text-sm text-[#6c6b6b]">Masuk ke akun HospiLedger Anda.</p>
        </div>
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="nama@perusahaan.com"
          error={emailError}
          autoComplete="email"
        />
        <AuthField
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
      </form>
    </AuthLayout>
  );
}
