import { createFileRoute } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";

import About from "@/components/landing/about";
import Cta from "@/components/landing/cta";
import Faq from "@/components/landing/faq";
import Features from "@/components/landing/features";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import Navbar from "@/components/landing/navbar";
import Pricing from "@/components/landing/pricing";
import Promo from "@/components/landing/promo";
import Services from "@/components/landing/services";
import { SectionSwitcher } from "@/components/landing/section-switcher";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="landing-page relative">
        <Navbar />
        <Hero />
        <Promo />
        <About />
        <Services />
        <Features />
        <Pricing />
        <Faq />
        <Cta />
        <Footer />
        <SectionSwitcher />
      </main>
    </MotionConfig>
  );
}
