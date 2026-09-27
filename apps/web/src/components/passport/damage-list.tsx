import type { DamageFinding, DamageKind, DamageSeverity } from "@hospiledger/shared";

const KIND_LABELS: Record<DamageKind, string> = {
  scratch: "Goresan",
  rust: "Karat",
  broken_component: "Komponen rusak",
  dent: "Penyok",
  dirty: "Kotor",
  missing_parts: "Bagian hilang",
};

const SEVERITY_LABELS: Record<DamageSeverity, string> = { low: "Ringan", medium: "Sedang", high: "Berat" };
const SEVERITY_CLASS: Record<DamageSeverity, string> = {
  low: "bg-muted text-ink-muted",
  medium: "bg-brand/10 text-brand-strong",
  high: "bg-red-50 text-red-600",
};

export function DamageList({ damage, overallSeverity }: { damage: DamageFinding[]; overallSeverity: DamageSeverity | null }) {
  if (damage.length === 0) {
    return <p className="text-sm text-ink-muted">Tidak ada kerusakan terdeteksi.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {overallSeverity && (
        <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_CLASS[overallSeverity]}`}>
          Keparahan keseluruhan: {SEVERITY_LABELS[overallSeverity]}
        </span>
      )}
      <ul className="flex flex-col divide-y divide-black/8">
        {damage.map((finding, index) => (
          <li key={index} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div>
              <span className="font-medium text-foreground">{KIND_LABELS[finding.kind]}</span>
              {finding.area && <span className="text-ink-muted"> · {finding.area}</span>}
              {finding.note && <p className="text-xs text-ink-muted">{finding.note}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_CLASS[finding.severity]}`}>
              {SEVERITY_LABELS[finding.severity]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
