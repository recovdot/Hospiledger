import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { Camera, ScanLine, ShieldCheck, QrCode, ChefHat } from "lucide-react";

import { ActionButton, GradientWord, SectionShell, mockPanelGradient } from "./primitives";

const entrance = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

type FloatTile = {
  icon: LucideIcon;
  label: string;
  className: string;
  drift: { y: number[]; rotate: number[] };
  duration: number;
  delay: number;
};

const floatTiles: FloatTile[] = [
  {
    icon: Camera,
    label: "Foto evidence",
    className: "top-24 right-[38%] md:top-32 md:right-[42%]",
    drift: { y: [6, -14, 6], rotate: [4, -3, 4] },
    duration: 5.5,
    delay: 0.4,
  },
  {
    icon: ScanLine,
    label: "Inspeksi AI",
    className: "top-10 left-[52%] hidden md:flex",
    drift: { y: [-6, 12, -6], rotate: [-5, 4, -5] },
    duration: 6,
    delay: 1.1,
  },
  {
    icon: ChefHat,
    label: "Aset hospitality",
    className: "bottom-24 left-[18%]",
    drift: { y: [4, -12, 4], rotate: [-6, 3, -6] },
    duration: 6.5,
    delay: 0.8,
  },
];

export default function Hero() {
  return (
    <SectionShell tone="light" className="pt-10 md:pt-16">
      <motion.div
        {...entrance}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="flex items-center justify-between gap-6"
      >
        <p className="text-sm text-ink-muted md:text-base">
          Jual peralatan hospitality dengan keyakinan.
        </p>
        <p className="hidden max-w-xs text-right text-sm text-ink-muted md:block">
          Inspeksi AI &middot; Passport digital &middot; Tercatat di Solana.
        </p>
      </motion.div>

      <motion.h1
        {...entrance}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
        className="mt-10 max-w-4xl text-[3rem] leading-[1.02] font-normal tracking-[-0.03em] md:mt-16 md:text-[5.25rem]"
      >
        Kepercayaan aset bekas,
        <br />
        <GradientWord>tercatat di Solana.</GradientWord>
      </motion.h1>

      <motion.div
        {...entrance}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.25 }}
        className="mt-8 flex flex-wrap items-center gap-4"
      >
        <ActionButton variant="primary" to="/register">Daftar sekarang</ActionButton>
        <a
          href="#layanan"
          className="rounded-full border border-black/15 px-6 py-3 text-base text-black transition-colors duration-300 hover:border-black/40"
        >
          Lihat cara kerjanya
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 }}
        className={`relative mt-14 min-h-[460px] overflow-hidden rounded-[28px] md:mt-20 md:min-h-[560px] ${mockPanelGradient}`}
      >
        {/* glass tubes behind floating fragments */}
        <div className="pointer-events-none absolute top-0 left-[10%] hidden h-full w-16 rounded-b-full bg-white/25 backdrop-blur-sm md:block" />
        <div className="pointer-events-none absolute top-0 right-[6%] hidden h-full w-10 rounded-b-full bg-white/25 backdrop-blur-sm md:block" />
        <div className="pointer-events-none absolute top-[18%] left-[28%] hidden h-64 w-40 rounded-[40px] bg-white/35 backdrop-blur-sm md:block" />

        {/* falling icon tiles */}
        {floatTiles.map(({ icon: Icon, label, className, drift, duration, delay }) => (
          <motion.div
            key={label}
            animate={drift}
            transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
            className={`absolute items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 backdrop-blur-sm ${className}`}
          >
            <Icon className="h-5 w-5 text-brand" strokeWidth={1.5} />
            <span className="text-xs text-black/60 md:text-sm">{label}</span>
          </motion.div>
        ))}

        {/* soft glass blobs */}
        <div className="pointer-events-none absolute -top-10 right-1/4 h-40 w-40 rounded-full bg-white/30 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-48 w-72 rounded-full bg-white/25 blur-3xl" />

        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-16 left-6 md:top-24 md:left-12"
        >
          <div className="w-64 rounded-2xl bg-white p-6 shadow-sm md:w-80">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-ink-muted md:text-sm">
                HPL-2026-00001
              </span>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] text-brand md:text-xs">
                Tercatat di Solana
              </span>
            </div>
            <p className="mt-3 text-lg md:text-xl">Gastroline Chiller GC-400</p>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-ink-muted md:text-sm">Skor kondisi</p>
                <p className="text-lg md:text-xl">82 · Grade A-</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted md:text-sm">Estimasi nilai</p>
                <p className="text-lg md:text-xl">Rp45.000.000</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute right-6 bottom-12 md:right-16 md:bottom-20"
        >
          <div className="w-44 rounded-2xl bg-stage p-5 text-white shadow-sm md:w-56">
            <p className="text-xs text-ink-muted-dark md:text-sm">Skor kondisi AI</p>
            <p className="mt-1 text-3xl md:text-4xl">82</p>
            <div className="mt-3 h-1.5 w-28 overflow-hidden rounded-full bg-stage-line">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: "82%" }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
                className="h-full rounded-full bg-brand"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="absolute bottom-12 left-6 hidden md:left-[44%] md:block"
        >
          <div className="rounded-2xl bg-white/90 px-5 py-4 text-sm shadow-sm backdrop-blur">
            <p className="text-ink-muted">Laporan kerusakan</p>
            <div className="mt-2 flex gap-2">
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs">Rust</span>
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs">Scratch</span>
              <span className="rounded-full bg-brand/15 px-3 py-1 text-xs text-brand">
                Medium
              </span>
            </div>
          </div>
        </motion.div>

        {/* QR share chip */}
        <motion.div
          animate={{ y: [0, 9, 0], rotate: [0, 2, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
          className="absolute top-32 right-6 hidden md:top-40 md:right-24 md:flex"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-white/70 p-4 backdrop-blur-sm">
            <div className="grid grid-cols-4 gap-0.5">
              {[1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0].map((filled, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-[2px] ${filled ? "bg-black/70" : "bg-transparent"}`}
                />
              ))}
            </div>
            <div>
              <p className="text-xs text-ink-muted">Bagikan passport</p>
              <p className="text-sm">via tautan & QR</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </SectionShell>
  );
}
