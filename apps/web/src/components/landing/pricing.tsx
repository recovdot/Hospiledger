import { ActionButton, GradientWord, HoverCard, Reveal, SectionShell, headingXl } from "@/components/landing/primitives";

const tiers = [
  {
    name: "Gratis",
    price: "Rp0",
    period: "/bulan",
    features: ["5 aset", "10 foto per aset", "Passport publik", "Verifikasi manual"],
    popular: false,
  },
  {
    name: "Seller Pro",
    price: "Rp499.000",
    period: "/bulan",
    features: [
      "50 aset",
      "Prioritas antrean inspeksi AI",
      "Coba ulang pencatatan Solana",
      "Laporan penjualan",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Hubungi kami",
    period: null,
    features: ["Aset tak terbatas", "Dukungan khusus", "Integrasi API"],
    popular: false,
  },
] as const;

export default function Pricing() {
  return (
    <SectionShell id="harga" tone="light">
      <Reveal>
        <p className="landing-eyebrow">PILIH SESUAI KEBUTUHAN</p>
        <h2 className={`${headingXl} max-w-4xl`}>
          Harga yang jujur <GradientWord>dari awal.</GradientWord>
        </h2>
      </Reveal>
      <div className="pricing-grid mt-14 grid gap-5 lg:grid-cols-3">
        {tiers.map(({ name, price, period, features, popular }, index) => (
          <HoverCard
            key={name}
            delay={index * 0.1}
            className={
              popular
                ? "pricing-card relative rounded-[28px] border-2 border-brand bg-white p-10 text-black"
                : "pricing-card relative rounded-[28px] border border-black/8 bg-white p-10 text-black"
            }
          >
            {popular && (
              <span className="absolute -top-3.5 left-10 rounded-full bg-brand px-4 py-1.5 text-xs text-white">
                Paling populer
              </span>
            )}
            <h3 className="text-xl text-ink-muted">{name}</h3>
            <p className="mt-6 tracking-tight">
              <span className="text-4xl xl:text-5xl">{price}</span>
              {period && <span className="text-ink-muted"> {period}</span>}
            </p>
            <ul className="mt-8 space-y-3 text-ink-muted md:text-lg">
              {features.map((feature) => (
                <li key={feature} className="border-b border-black/8 pb-3 last:border-b-0">
                  {feature}
                </li>
              ))}
            </ul>
            <div className="pricing-action mt-10">
              <ActionButton variant={popular ? "primary" : "outline"} to="/register">
                {popular
                  ? "Pilih Seller Pro"
                  : name === "Gratis"
                    ? "Mulai gratis"
                    : "Hubungi kami"}
              </ActionButton>
            </div>
          </HoverCard>
        ))}
      </div>
    </SectionShell>
  );
}
