import type { ReactNode } from "react";

import { motion } from "motion/react";

import { cn } from "@hospiledger/ui/lib/utils";

import { Link } from "@tanstack/react-router";

export function ActionButton({
  children,
  variant,
  dark,
  to,
}: {
  children: ReactNode;
  variant: "primary" | "outline";
  dark?: boolean;
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex rounded-full px-6 py-3 text-base transition-colors duration-300",
        variant === "primary" && "bg-brand text-white hover:bg-brand-strong",
        variant === "outline" &&
          (dark
            ? "border border-white bg-transparent text-white hover:border-white/60"
            : "border border-black/15 bg-transparent text-black hover:border-black/40"),
      )}
    >
      {children}
    </Link>
  );
}

export function SectionShell({
  id,
  tone,
  className,
  children,
}: {
  id?: string;
  tone: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 md:py-24",
        tone === "light" ? "bg-canvas text-black" : "bg-stage text-white",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1180px] px-5 md:px-8">{children}</div>
    </section>
  );
}

export function GradientWord({ children }: { children: ReactNode }) {
  return (
    <em className="bg-gradient-to-r from-brand-soft via-[#c58cff] to-[#8ab6ff] bg-clip-text font-normal not-italic text-transparent">
      {children}
    </em>
  );
}

export const headingXl =
  "text-[2.5rem] leading-[1.04] font-normal tracking-[-0.03em] md:text-[3.75rem] lg:text-[4.25rem]";

export const kicker =
  "text-sm md:text-base font-medium text-ink-muted uppercase tracking-[0.14em]";

const revealConfig = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
} as const;

export function Reveal({
  children,
  delay,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      {...revealConfig}
      transition={{ duration: 0.7, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function HoverCard({
  children,
  className,
  delay,
}: {
  children: ReactNode;
  className: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      whileHover={{ y: -6 }}
      transition={{
        opacity: { duration: 0.7, ease: "easeOut", delay },
        y: { type: "spring", stiffness: 300, damping: 24 },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      whileHover={{ y: -4 }}
      transition={{
        opacity: { duration: 0.7, ease: "easeOut" },
        y: { type: "spring", stiffness: 300, damping: 24 },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Panel({
  id,
  tone,
  className,
  children,
}: {
  id?: string;
  tone: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "mx-auto w-full rounded-[28px] px-8 py-14 md:px-14 md:py-20",
        tone === "light" ? "bg-white text-black" : "bg-stage text-white",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const mockPanelGradient =
  "bg-[linear-gradient(135deg,#aee8f9_0%,#c9c2f5_45%,#b78aff_100%)]";
