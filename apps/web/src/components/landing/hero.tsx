import { ArrowDown, ArrowUpRight, Check, ScanLine, ShieldCheck } from "lucide-react";

import { ActionButton, Reveal, SectionShell } from "@/components/landing/primitives";

export default function Hero() {
  return (
    <SectionShell tone="light" className="landing-hero">
      <div className="hero-layout">
        <Reveal className="hero-copy">
          <p className="landing-eyebrow"><span /> IDENTITAS DIGITAL PERALATAN ANDA</p>
          <h1>Peralatan bekas.<br />Bukti nyata.<br /><span className="hero-accent">Lebih dipercaya.</span></h1>
          <p className="hero-description">Tampilkan kondisi peralatan hospitality melalui foto bukti, analisis AI, dan passport digital yang mudah dibagikan.</p>
          <div className="hero-actions">
            <ActionButton variant="primary" to="/register">Buat passport aset <ArrowUpRight size={18} aria-hidden="true" /></ActionButton>
            <a href="#layanan" className="hero-secondary">Lihat cara kerjanya <ArrowDown size={16} aria-hidden="true" /></a>
          </div>
          <div className="hero-assurances"><span><Check size={16} aria-hidden="true" /> Ditinjau oleh penjual</span><span><Check size={16} aria-hidden="true" /> Tanpa wallet atau crypto</span></div>
        </Reveal>
        <Reveal delay={0.15} className="hero-showcase">
          <div className="showcase-heading"><span><ScanLine size={16} aria-hidden="true" /> DIGITAL ASSET PASSPORT</span><span>CONTOH</span></div>
          <div className="equipment-illustration">
            <svg viewBox="0 0 400 300" role="img" aria-label="Ilustrasi chiller komersial dua pintu" className="equipment-svg">
              <defs>
                <linearGradient id="chiller-metal" x1="0" x2="1"><stop stopColor="var(--color-white)" /><stop offset="0.5" stopColor="var(--color-canvas)" /><stop offset="1" stopColor="var(--color-white)" /></linearGradient>
              </defs>
              <ellipse cx="203" cy="273" rx="119" ry="12" fill="currentColor" opacity="0.08" />
              <path d="M106 39 286 26 310 45 310 256 130 270 106 253Z" fill="var(--color-stage)" />
              <path d="M106 39 286 26 286 250 106 253Z" fill="url(#chiller-metal)" stroke="currentColor" strokeOpacity="0.2" />
              <path d="M286 26 310 45 310 256 286 250Z" fill="var(--color-stage-panel)" />
              <path d="m116 48 159-11v29L116 77Z" fill="var(--color-stage-panel)" />
              <path d="m128 56 73-5m-73 11 73-5m-73 11 73-5" stroke="var(--color-ink-muted-dark)" strokeWidth="2" />
              <rect x="240" y="46" width="24" height="11" rx="2" fill="var(--color-brand-soft)" />
              <path d="m116 87 73-5v156l-73 3Zm83-6 76-5v158l-76 4Z" fill="var(--color-canvas)" stroke="currentColor" strokeOpacity="0.15" />
              <path d="m123 95 58-4v137l-58 2Zm84-6 60-4v140l-60 3Z" fill="var(--color-stage)" />
              <g stroke="var(--color-ink-muted-dark)" strokeWidth="2"><path d="m124 130 56-3m-56 35 56-2m-56 34 56-2m28-66 57-3m-57 35 57-2m-57 34 57-2" /></g>
              <path d="m132 102 14-1-14 112Zm86-6 14-1-14 116Z" fill="var(--color-white)" opacity="0.12" />
              <path d="M184 147v28m19-30v28" stroke="var(--color-white)" strokeWidth="4" strokeLinecap="round" />
              <path d="M119 254v12m157-15v12m24-7v10" stroke="var(--color-stage)" strokeWidth="8" />
              <path d="M76 83V62h20m227-5h20v21M76 224v21h20m227 4h20v-21" fill="none" stroke="var(--color-brand)" strokeWidth="2" />
            </svg>
            <div className="illustration-caption"><span className="scan-dot" /> Ilustrasi peralatan · Tampak depan</div>
          </div>
          <div className="passport-preview">
            <div className="passport-preview-heading"><span className="passport-code">HPL-2026-00001</span><span className="preview-approved"><Check size={12} aria-hidden="true" /> Disetujui penjual</span></div>
            <h2>Gastroline Chiller GC-400</h2>
            <p className="preview-category">Pendingin komersial · Contoh passport</p>
            <div className="preview-metrics">
              <div><span className="preview-label">Skor kondisi AI</span><div className="preview-score">82<span>/100</span><span className="preview-grade">A−</span></div><div className="preview-score-track"><span /></div></div>
              <div><span className="preview-label">Estimasi nilai AI</span><p className="preview-value">Rp40–48 juta</p><span className="preview-label">Contoh rentang estimasi</span></div>
            </div>
            <div className="preview-footer"><ShieldCheck size={16} aria-hidden="true" /><span>Tercatat di Solana</span><ArrowUpRight size={15} aria-hidden="true" /></div>
          </div>
          <p className="showcase-note">Contoh tampilan · Hasil AI ditinjau penjual sebelum publikasi.</p>
        </Reveal>
      </div>
    </SectionShell>
  );
}
