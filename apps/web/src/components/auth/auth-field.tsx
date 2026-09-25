import { isTRPCClientError } from "@trpc/client";
import { Link } from "@tanstack/react-router";
import { Field } from "@hospiledger/ui/components/field";

export function AuthField({
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <Field
      label={label}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      error={error}
      inputClassName="rounded-full"
    />
  );
}

export function trpcErrorCode(error: unknown): string | undefined {
  if (isTRPCClientError(error)) return error.data?.code;
  return undefined;
}

/** profile.me rejects a session without a `profiles` row with UNAUTHORIZED — treated as profile-missing. */
export function isProfileMissing(error: unknown): boolean {
  return trpcErrorCode(error) === "NOT_FOUND" || trpcErrorCode(error) === "UNAUTHORIZED";
}

export function localizeAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) return "Email atau kata sandi salah.";
  if (message.includes("User already registered")) return "Email sudah terdaftar.";
  return message;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
      {message}
    </div>
  );
}

export function SubmitButton({ children, submitting }: { children: React.ReactNode; submitting: boolean }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="h-11 w-full rounded-full bg-brand text-base text-white transition-colors duration-300 hover:bg-brand-strong disabled:opacity-70"
    >
      {children}
    </button>
  );
}

export function AuthLayout({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-black">
      <div className="px-5 py-6">
        <Link to="/" className="text-lg font-bold tracking-tight">
          HospiLedger
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-5 pb-10">
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <div className="w-full rounded-[28px] bg-white p-6 md:p-10">{children}</div>
          <p className="text-sm text-ink-muted">{footer}</p>
        </div>
      </div>
    </div>
  );
}
