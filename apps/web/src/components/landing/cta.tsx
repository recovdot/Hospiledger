import { ActionButton, GradientWord, Reveal, SectionShell, headingXl, mockPanelGradient } from "./primitives";

export default function Cta() {
  return (
    <SectionShell tone="dark" className="py-20 md:py-32">
      <Reveal>
        <div className={`relative overflow-hidden rounded-[28px] ${mockPanelGradient}`}>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 55% at 50% 65%, rgba(177, 84, 249, 0.35), transparent 70%)",
            }}
          />
          <div className="relative px-8 py-20 text-center text-black md:py-32">
            <h2 className={`${headingXl} mx-auto max-w-3xl`}>
              Siap menjual dengan{" "}
              <span className="bg-gradient-to-r from-[#a53df5] to-[#7048e8] bg-clip-text text-transparent">
                bukti, bukan janji
              </span>
              ?
            </h2>
            <p className="mt-6 text-lg text-black/60 md:text-xl">
              Buat passport aset pertama Anda hari ini.
            </p>
            <div className="mt-10 flex justify-center">
              <ActionButton variant="primary" to="/register">Daftar sekarang</ActionButton>
            </div>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
