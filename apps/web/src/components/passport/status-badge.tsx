import { Badge } from "@hospiledger/ui/components/badge";
import type { PassportStatus } from "@hospiledger/shared";
import { cn } from "@hospiledger/ui/lib/utils";

import { PASSPORT_STATUS_LABELS, PASSPORT_STATUS_TONE } from "@/lib/passport-status-labels";

const TONE_CLASS: Record<"neutral" | "active" | "failed", string> = {
  neutral: "bg-canvas text-ink-muted",
  active: "bg-brand/10 text-brand-strong",
  failed: "bg-red-50 text-red-600",
};

export function StatusBadge({ status, className }: { status: PassportStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full border-transparent px-3 py-1", TONE_CLASS[PASSPORT_STATUS_TONE[status]], className)}>
      {PASSPORT_STATUS_LABELS[status]}
    </Badge>
  );
}
