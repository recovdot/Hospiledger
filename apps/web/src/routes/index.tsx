import { createFileRoute } from "@tanstack/react-router";

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

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <main>
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
    </main>
  );
}
