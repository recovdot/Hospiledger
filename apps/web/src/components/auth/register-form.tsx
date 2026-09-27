import { useEffect, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SelfSelectableRole } from "@hospiledger/shared";
import { SELF_SELECTABLE_ROLES } from "@hospiledger/shared";
import { cn } from "@hospiledger/ui/lib/utils";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { AuthField, AuthLayout, ErrorBanner, SubmitButton, localizeAuthError, trpcErrorCode } from "./auth-field";

function profileErrorMessage(error: unknown): string {
  if (trpcErrorCode(error) === "FORBIDDEN" || trpcErrorCode(error) === "UNAUTHORIZED") {
    return "Sesi berakhir. Silakan masuk kembali.";
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan.";
}

const ROLE_LABELS: Record<SelfSelectableRole, { title: string; sub: string }> = {
  seller: { title: "Seller", sub: "Jual aset" },
  buyer: { title: "Buyer", sub: "Cari aset" },
  inspector: { title: "Inspector", sub: "Inspeksi aset" },
};

export function RegisterForm() {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const completeProfile = useMutation(trpc.profile.complete.mutationOptions());
  const search = router.state.location.search;
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(search?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<SelfSelectableRole>("seller");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [companyError, setCompanyError] = useState<string | undefined>();
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session) {
        setStep(2);
        setEmail((prev) => prev || sessionData.session?.user.email || prev);
      }
    });
  }, []);

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);
    let valid = true;
    if (!email) {
      setEmailError("Email wajib diisi.");
      valid = false;
    }
    if (!password) {
      setPasswordError("Kata sandi wajib diisi.");
      valid = false;
    } else if (password.length < 8) {
      setPasswordError("Kata sandi minimal 8 karakter.");
      valid = false;
    }
    if (passwordConfirm !== password) {
      setConfirmError("Konfirmasi kata sandi tidak cocok.");
      valid = false;
    }
    if (valid) setStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setNameError(undefined);
    setCompanyError(undefined);
    setPhoneError(undefined);
    setBanner(undefined);
    let valid = true;
    if (!name) {
      setNameError("Nama lengkap wajib diisi.");
      valid = false;
    }
    if (!companyName) {
      setCompanyError("Nama perusahaan wajib diisi.");
      valid = false;
    }
    if (!phone) {
      setPhoneError("Nomor telepon wajib diisi.");
      valid = false;
    }
    if (!valid) return;
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const auth = await supabase.auth.signUp({ email, password });
        if (auth.error) {
          setBanner(localizeAuthError(auth.error.message));
          return;
        }
        if (!auth.data.session) {
          setAwaitingConfirmation(true);
          return;
        }
      }
      try {
        await completeProfile.mutateAsync({ name, phone, companyName, role });
      } catch (profileError) {
        if (trpcErrorCode(profileError) === "CONFLICT") {
          await navigate({ to: "/app", replace: true });
          return;
        }
        setBanner(`Gagal menyimpan profil. ${localizeAuthError(profileErrorMessage(profileError))}`);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: trpc.profile.me.queryOptions().queryKey,
      });
      await navigate({ to: "/app", replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout
        footer={
          <>
            Sudah punya akun?{" "}
            <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
              Masuk
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Cek email Anda</h1>
          <p className="text-sm text-ink-muted">
            Cek email Anda untuk konfirmasi akun sebelum masuk.
          </p>
          <Link
            to="/login"
            className="h-11 w-full rounded-full bg-brand text-center text-base leading-[2.75rem] text-white transition-colors duration-300 hover:bg-brand-active"
          >
            Masuk
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      footer={
        <>
          Sudah punya akun?{" "}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Masuk
          </Link>
        </>
      }
    >
      {step === 1 ? (
        <form onSubmit={handleStep1} className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Daftar</h1>
            <p className="mt-1 text-sm text-ink-muted">Langkah 1 dari 2 — Akun</p>
          </div>
          <AuthField
            id="register-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="nama@perusahaan.com"
            error={emailError}
            autoComplete="email"
          />
          <AuthField
            id="register-password"
            label="Kata sandi"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Minimal 8 karakter"
            error={passwordError}
            autoComplete="new-password"
          />
          <AuthField
            id="register-confirm"
            label="Konfirmasi kata sandi"
            type="password"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            placeholder="Ulangi kata sandi"
            error={confirmError}
            autoComplete="new-password"
          />
          {banner && <ErrorBanner message={banner} />}
          <SubmitButton submitting={false}>Lanjut ke profil</SubmitButton>
        </form>
      ) : (
        <form onSubmit={handleStep2} className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Daftar</h1>
            <p className="mt-1 text-sm text-ink-muted">Langkah 2 dari 2 — Profil</p>
          </div>
          <AuthField
            id="register-name"
            label="Nama lengkap"
            type="text"
            value={name}
            onChange={setName}
            placeholder="Nama Anda"
            error={nameError}
            autoComplete="name"
          />
          <AuthField
            id="register-company"
            label="Nama perusahaan"
            type="text"
            value={companyName}
            onChange={setCompanyName}
            placeholder="PT Contoh Aset"
            error={companyError}
            autoComplete="organization"
          />
          <AuthField
            id="register-phone"
            label="Nomor telepon"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="0812xxxxxxx"
            error={phoneError}
            autoComplete="tel"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Peran</label>
            <div className="flex flex-wrap gap-2">
              {SELF_SELECTABLE_ROLES.map((option) => {
                const selected = option === role;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRole(option)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors duration-300",
                      selected
                        ? "border-brand bg-brand/10 text-brand-strong"
                        : "border-border bg-transparent text-ink-muted hover:border-foreground/40",
                    )}
                  >
                    <span className="font-medium">{ROLE_LABELS[option].title}</span>
                    <span className="ml-1.5 text-ink-muted">{ROLE_LABELS[option].sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {banner && <ErrorBanner message={banner} />}
          <SubmitButton submitting={submitting}>Daftar</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
