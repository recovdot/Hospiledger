export function ConditionScore({ score, grade }: { score: number | null; grade: string | null }) {
  if (score === null) {
    return <p className="text-sm text-ink-muted">Skor kondisi belum tersedia.</p>;
  }
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-stage text-white">
        <span className="text-xl font-semibold">{grade ?? "-"}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-muted">Skor kondisi</span>
          <span className="font-medium text-foreground">{score}/100</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-label="Skor kondisi"
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}
