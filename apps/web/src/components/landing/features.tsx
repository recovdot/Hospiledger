import { Link2, QrCode, ScanLine, ShieldCheck, TrendingDown, UserCheck } from "lucide-react";

import { GradientWord, MotionCard, Reveal, SectionShell, headingXl } from "./primitives";

const features = [
  {
    icon: ScanLine,
    title: "Skor kondisi 0–100",
    body: "Setiap aset dinilai AI dari foto evidence, menghasilkan skor dan grade yang mudah dibandingkan.",
  },
  {
    icon: ShieldCheck,
    title: "Laporan kerusakan berlapis",
    body: "Temuan kerusakan diklasifikasikan dengan tingkat keparahan low, medium, atau high.",
  },
  {
    icon: TrendingDown,
    title: "Estimasi nilai berkisar",
    body: "Selalu rentang, bukan angka pasti — agar ekspektasi penjual dan pembeli tetap realistis.",
  },
  {
    icon: Link2,
    title: "Hash tercatat di Solana",
    body: "Integritas passport bisa diperiksa ulang siapa saja terhadap hash yang tercatat di blockchain.",
  },
  {
    icon: QrCode,
    title: "Berbagi via tautan & QR",
    body: "Setiap passport punya tautan publik dan QR code yang tinggal dibagikan ke pembeli.",
  },
  {
    icon: UserCheck,
    title: "Seller tetap memegang kendali",
    body: "AI bukan hakim akhir. Seller meninjau, mengoreksi, dan menyetujui sebelum publikasi.",
  },
] as const;

export default function Features() {
  return (
    <SectionShell id="fitur" tone="dark" className="pt-10 md:pt-16">
      <Reveal>
        <h2 className={`${headingXl} max-w-4xl`}>
          Semua yang dibutuhkan untuk{" "}
          <GradientWord>jual-beli percaya.</GradientWord>
        </h2>
      </Reveal>
      <div className="mt-14 space-y-5">
        {features.map(({ icon: Icon, title, body }, index) => (
          <Reveal key={title} delay={(index % 2) * 0.08}>
            <MotionCard className="rounded-[28px] bg-stage-panel px-8 py-8 md:px-12 md:py-10">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-12">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/15">
                  <Icon className="h-7 w-7 text-brand-soft" strokeWidth={1.5} />
                </div>
                <div className="md:max-w-md">
                  <h3 className="text-2xl tracking-tight md:text-3xl">{title}</h3>
                  <p className="mt-2 max-w-xl text-ink-muted-dark md:text-lg">{body}</p>
                </div>
              </div>
            </MotionCard>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}
