import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const sections = [
  { href: "#layanan", label: "Layanan", tone: "light" },
  { href: "#fitur", label: "Fitur", tone: "dark" },
  { href: "#harga", label: "Harga", tone: "light" },
] as const;

export function SectionSwitcher() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = sections
      .map(({ href }) => document.querySelector(href))
      .filter((el): el is Element => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(({ isIntersecting }) => isIntersecting);
        if (visible.length === 0) return;
        visible.sort(
          (a, b) => b.intersectionRatio - a.intersectionRatio,
        );
        setActive(`#${visible[0].target.id}`);
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.2, 0.6] },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <motion.nav
      aria-label="Navigasi bagian"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.6 }}
      className="fixed right-5 bottom-5 z-40 hidden flex-col gap-2 xl:flex"
    >
      {(() => {
        const activeTone =
          sections.find(({ href }) => href === active)?.tone ?? "light";
        return sections.map(({ href, label }) => {
          const isActive = active === href;
          return (
            <a
              key={href}
              href={href}
              aria-current={isActive ? "true" : undefined}
              className={`w-[132px] rounded-[14px] px-5 py-3 text-center text-sm transition-colors duration-300 ${
                isActive
                  ? "bg-white text-black"
                  : activeTone === "dark"
                    ? "border border-white/25 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
                    : "border border-black/10 bg-white/70 text-black backdrop-blur-sm hover:bg-white"
              }`}
            >
              {label}
            </a>
          );
        });
      })()}
    </motion.nav>
  );
}
