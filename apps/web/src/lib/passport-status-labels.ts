import type { PassportStatus } from "@hospiledger/shared";

export const PASSPORT_STATUS_LABELS: Record<PassportStatus, string> = {
  draft: "Draf",
  submitted: "Terkirim",
  ai_processing: "Inspeksi AI berjalan",
  ai_complete: "Inspeksi AI selesai",
  pending_review: "Menunggu review",
  approved: "Disetujui",
  published: "Dipublikasikan",
  ai_failed: "Inspeksi AI gagal",
};

/** Purple is the only chromatic system color (DESIGN.md); red is reserved for the one failure state. */
export const PASSPORT_STATUS_TONE: Record<PassportStatus, "neutral" | "active" | "failed"> = {
  draft: "neutral",
  submitted: "active",
  ai_processing: "active",
  ai_complete: "active",
  pending_review: "active",
  approved: "active",
  published: "active",
  ai_failed: "failed",
};
