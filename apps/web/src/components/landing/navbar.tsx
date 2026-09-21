import { motion } from "motion/react";

import { ActionButton } from "./primitives";

const links = [
  { href: "#layanan", label: "Layanan" },
  { href: "#fitur", label: "Fitur" },
  { href: "#harga", label: "Harga" },
  { href: "#faq", label: "FAQ" },
] as const;

export default function Navbar() {
  return (
    <motion.header
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="sticky top-0 z-40 bg-[#f1f1f1]/90 text-black backdrop-blur"
    >
      <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between px-5">
        <span className="font-bold tracking-tight">HospiLedger</span>
        <nav className="hidden gap-8 md:flex">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-base text-[#6c6b6b] transition-colors duration-300 hover:text-black"
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
        </div>
      </div>
    </motion.header>
  );
}
