import { GradientWord, Reveal, SectionShell, headingXl } from "@/components/landing/primitives";

const steps = [
  {
    number: "01",
    title: "Unggah aset",
    body: "Data peralatan dan foto evidence dari setiap sisi.",
  },
  {
    number: "02",
    title: "Inspeksi AI",
    body: "Identitas, pembacaan nameplate, dan deteksi kerusakan.",
  },
  {
    number: "03",
    title: "Passport digital",
    body: "Skor kondisi dan estimasi nilai berkisar tersusun otomatis.",
  },
  {
    number: "04",
    title: "Tinjauan seller",
    body: "Seller meninjau dan menyetujui sebelum publikasi.",
  },
  {
    number: "05",
    title: "Publikasi & verifikasi",
    body: "Hash tercatat di Solana, siap dibagikan kepada pembeli.",
  },
] as const;

export default function Services() {
  return (
    <SectionShell id="layanan" tone="light">
      <Reveal>
        <p className="landing-eyebrow">CARA KERJA</p>
        <h2 className={`${headingXl} max-w-4xl`}>
          Dari foto menjadi <GradientWord>passport terverifikasi.</GradientWord>
        </h2>
      </Reveal>
      <Reveal delay={0.15} className="mt-14">
        <div className="rounded-[28px] bg-white px-8 md:px-14">
          {steps.map(({ number, title, body }) => (
            <div
              key={number}
              className="grid grid-cols-[auto_1fr] items-baseline gap-6 border-b border-black/8 py-8 last:border-b-0 md:grid-cols-[120px_1fr_1fr] md:gap-10 md:py-10"
            >
              <span className="text-xl text-brand md:text-2xl">{number}</span>
              <h3 className="text-2xl tracking-tight md:text-3xl">{title}</h3>
              <p className="col-span-2 text-ink-muted md:col-span-1 md:text-lg">
                {body}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </SectionShell>
  );
}
