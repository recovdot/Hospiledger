import { useState } from "react";
import { Menu, X } from "lucide-react";
import { motion } from "motion/react";

import { ActionButton } from "./primitives";

const links = [
  { href: "#layanan", label: "Layanan" },
  { href: "#fitur", label: "Fitur" },
  { href: "#harga", label: "Harga" },
  { href: "#faq", label: "FAQ" },
] as const;

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.header
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="sticky top-0 z-40 border-b border-black/8 bg-canvas/90 text-black backdrop-blur"
    >
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-5 md:px-8">
        <span className="font-bold tracking-tight">HospiLedger</span>
        <nav className="hidden gap-8 md:flex">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-base text-ink-muted transition-colors duration-300 hover:text-black"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="hidden md:inline-flex">
            <ActionButton variant="outline" to="/login">
              Masuk
            </ActionButton>
          </span>
          <ActionButton variant="primary" to="/register">
            <span className="hidden sm:inline">Daftar sekarang</span>
            <span className="sm:hidden">Daftar</span>
          </ActionButton>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-black/15 transition-colors duration-300 hover:border-black/40 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="landing-mobile-menu" className="border-t border-black/10 px-5 pb-5 md:hidden">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block py-3 text-base text-ink-muted transition-colors duration-300 hover:text-black"
            >
              {label}
            </a>
          ))}
          <div className="mt-2">
            <ActionButton variant="outline" to="/login">
              Masuk
            </ActionButton>
          </div>
        </nav>
      )}
    </motion.header>
  );
}
