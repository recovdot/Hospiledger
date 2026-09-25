import { Reveal, SectionShell, headingXl } from "./primitives";

export default function About() {
  return (
    <SectionShell id="tentang" tone="light">
      <Reveal>
        <h2 className={`${headingXl} max-w-4xl`}>
          Pembeli tidak bisa melihat barang dari jauh.
          <br />
          <span className="text-ink-muted">
            HospiLedger mengubahnya menjadi <span className="text-black">passport digital.</span>
          </span>
        </h2>
      </Reveal>
      <Reveal delay={0.15} className="mt-14 grid gap-10 md:grid-cols-2 md:gap-16">
        <p className="max-w-xl text-lg leading-relaxed text-ink-muted md:text-xl">
          Identitas, skor kondisi, laporan kerusakan, dan estimasi nilai —
          diverifikasi ulang terhadap hash yang tercatat di Solana.
        </p>
        <p className="text-2xl tracking-tight md:text-3xl">
          3 langkah · 1 passport · 0 kunjungan lapangan
        </p>
      </Reveal>
    </SectionShell>
  );
}
