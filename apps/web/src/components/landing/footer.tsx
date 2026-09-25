const productLinks = [
  { href: "#layanan", label: "Layanan" },
  { href: "#fitur", label: "Fitur" },
  { href: "#harga", label: "Harga" },
] as const;

const companyLinks = [
  { href: "#tentang", label: "Tentang" },
  { href: "#faq", label: "FAQ" },
] as const;

export default function Footer() {
  return (
    <footer className="bg-stage pt-10 pb-10 text-white">
      <div className="mx-auto w-full max-w-[1180px] px-5 md:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <span className="font-bold tracking-tight">HospiLedger</span>
            <p className="mt-2 text-ink-muted">Asset trust builds opportunity.</p>
          </div>
          <div className="flex gap-16 md:gap-24">
            <div>
              <h3 className="text-sm text-ink-muted">Produk</h3>
              <ul className="mt-4 space-y-3">
                {productLinks.map(({ href, label }) => (
                  <li key={href}>
                    <a href={href} className="text-lg transition-colors duration-300 hover:text-brand-soft">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm text-ink-muted">Perusahaan</h3>
              <ul className="mt-4 space-y-3">
                {companyLinks.map(({ href, label }) => (
                  <li key={href}>
                    <a href={href} className="text-lg transition-colors duration-300 hover:text-brand-soft">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-20 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-ink-muted md:flex-row md:items-center md:justify-between">
          <span>© 2026 HospiLedger</span>
          <span>Tercatat di Solana — integritas dapat diverifikasi ulang.</span>
        </div>
      </div>
    </footer>
  );
}
