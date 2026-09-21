import { ActionButton, GradientWord, HoverCard, Reveal, SectionShell, headingXl } from "./primitives";

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
    <SectionShell id="harga" tone="dark">
      <Reveal>
        <h2 className={`${headingXl} max-w-4xl`}>
          Harga yang jujur <GradientWord>dari awal.</GradientWord>
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {tiers.map(({ name, price, period, features, popular }, index) => (
          <HoverCard
            key={name}
            delay={index * 0.1}
            className={
              popular
                ? "relative rounded-[28px] border-2 border-[#b154f9] bg-white p-10 text-black"
                : "relative rounded-[28px] bg-white p-10 text-black"
            }
          >
            {popular && (
              <span className="absolute -top-3.5 left-10 rounded-full bg-[#b154f9] px-4 py-1.5 text-xs text-white">
                Paling populer
              </span>
            )}
            <h3 className="text-xl text-[#6c6b6b]">{name}</h3>
            <p className="mt-6 tracking-tight">
              <span className="text-4xl md:text-5xl">{price}</span>
              {period && <span className="text-[#a3a3a3]"> {period}</span>}
            </p>
            <ul className="mt-8 space-y-3 text-[#6c6b6b] md:text-lg">
              {features.map((feature) => (
                <li key={feature} className="border-b border-black/8 pb-3 last:border-b-0">
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-10">
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
