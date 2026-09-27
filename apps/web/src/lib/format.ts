import type { DamageKind, DamageSeverity, PhotoType, VerificationResult } from "@hospiledger/shared";

/** Formats an IDR amount as `Rp45.000.000` (dot thousands separator), or a placeholder when unknown. */
export function formatRupiah(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "Belum ada estimasi";
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return "Belum ada estimasi";
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

/** Formats an IDR value range, or a single value when min/max are unavailable. */
export function formatRupiahRange(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
  estimate: string | number | null | undefined,
): string {
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${formatRupiah(min)} – ${formatRupiah(max)}`;
  }
  return formatRupiah(estimate);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value);
}

export function formatConfidence(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Indonesian labels for equipment damage kinds (AI inspection output). */
export const DAMAGE_KIND_LABEL: Record<DamageKind, string> = {
  scratch: "Goresan",
  rust: "Karat",
  broken_component: "Komponen rusak",
  dent: "Penyok",
  dirty: "Kondisi kotor",
  missing_parts: "Bagian hilang",
};

export const DAMAGE_SEVERITY_LABEL: Record<DamageSeverity, string> = {
  low: "Ringan",
  medium: "Sedang",
  high: "Berat",
};

export const PHOTO_TYPE_LABEL: Record<PhotoType, string> = {
  front: "Tampak depan",
  side: "Tampak samping",
  back: "Tampak belakang",
  nameplate: "Nameplate",
  damage: "Kerusakan",
};

export const PHOTO_TYPE_HINT: Record<PhotoType, string> = {
  front: "Ambil dari bagian depan, seluruh unit terlihat.",
  side: "Ambil dari bagian samping, seluruh unit terlihat.",
  back: "Ambil dari bagian belakang, seluruh unit terlihat.",
  nameplate: "Foto label nameplate agar serial number terbaca jelas.",
  damage: "Fokuskan pada area kerusakan yang terlihat.",
};

/** Badge text and tone per anchor verification result; UI copy never names the cluster. */
export const VERIFY_RESULT_LABEL: Record<
  VerificationResult,
  { label: string; tone: "ok" | "warn" | "bad" | "muted" }
> = {
  match: { label: "Tercatat di Solana", tone: "ok" },
  mismatch: { label: "Hash tidak cocok dengan Solana", tone: "bad" },
  pending: { label: "Menunggu pencatatan Solana", tone: "warn" },
  not_found: { label: "Tidak ditemukan di Solana", tone: "bad" },
  unreachable: { label: "Tidak dapat memeriksa Solana", tone: "muted" },
};
