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
