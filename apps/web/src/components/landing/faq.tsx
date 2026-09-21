import { useState } from "react";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { Reveal, SectionShell, headingXl } from "./primitives";

const items = [
  {
    question: "Apakah data saya aman?",
    answer:
      "Foto disimpan di penyimpanan privat dan hanya dibagikan sebagai tautan bertanda tangan sementara. Yang tercatat di blockchain hanya hash, bukan data.",
  },
  {
    question: "Apakah catatan di Solana bersifat permanen?",
    answer:
      "HospiLedger memakai Solana saat MVP. Jaringan tersebut bisa direset, jadi pencatatan bersifat tamper-evident — perubahan bisa dideteksi, bukan mustahil terjadi.",
  },
  {
    question: "Apakah hasil AI bisa langsung dipublikasikan?",
    answer:
      "Tidak. Seller meninjau dan menyetujui setiap passport sebelum publikasi. Hasil AI asli tidak pernah ditimpa.",
  },
  {
    question: "Apakah saya butuh wallet atau crypto?",
    answer: "Tidak. Semua biaya transaksi ditanggung platform.",
  },
] as const;

function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[#e5e5e5] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-6 px-8 py-7 text-left text-xl md:px-14 md:text-2xl"
        aria-expanded={open}
      >
        {question}
        <ChevronDown
          className={`h-6 w-6 shrink-0 text-[#6c6b6b] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-8 pb-7 text-[#6c6b6b] md:px-14 md:text-lg">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  const [openIndexes, setOpenIndexes] = useState<number[]>([]);

  return (
    <SectionShell id="faq" tone="light">
      <Reveal>
        <h2 className={`${headingXl} max-w-4xl`}>Pertanyaan yang sering diajukan.</h2>
      </Reveal>
      <Reveal delay={0.1}>
      <div className="mt-14 rounded-[28px] bg-white">
        {items.map(({ question, answer }, index) => (
          <FaqItem
            key={question}
            question={question}
            answer={answer}
            open={openIndexes.includes(index)}
            onToggle={() =>
              setOpenIndexes((prev) =>
                prev.includes(index)
                  ? prev.filter((openIndex) => openIndex !== index)
                  : [...prev, index],
              )
            }
          />
        ))}
      </div>
      </Reveal>
    </SectionShell>
  );
}
