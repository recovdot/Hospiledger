import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

import { ActionButton, Reveal, SectionShell, mockPanelGradient } from "./primitives";

export default function Promo() {
  return (
    <SectionShell tone="light" className="py-0 pb-16 md:pb-24">
      <Reveal>
        <div
          className={`relative mx-auto flex max-w-4xl flex-col items-center gap-6 overflow-hidden rounded-[28px] px-8 py-10 text-center md:flex-row md:justify-between md:px-12 md:py-8 md:text-left ${mockPanelGradient}`}
        >
          <div className="flex items-center gap-4 text-left md:gap-5">
            <motion.div
              animate={{ rotate: [0, 12, -8, 0], scale: [1, 1.12, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 md:flex"
            >
              <Sparkles className="h-7 w-7 text-brand" strokeWidth={1.5} />
            </motion.div>
            <div>
              <p className="text-2xl font-medium tracking-tight md:text-3xl">
                Gratis untuk 10 aset pertama
              </p>
              <p className="mt-1 text-sm text-black/60 md:text-base">
                Coba alur inspeksi AI tanpa biaya selama MVP.
              </p>
            </div>
          </div>
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="shrink-0"
          >
            <ActionButton variant="primary" to="/register">Mulai sekarang</ActionButton>
          </motion.div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
