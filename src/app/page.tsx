/**
 * Landing — / (page d'accueil publique)
 *
 * Server Component qui orchestre les sections. La plupart sont
 * Server-rendered ; les îlots Client (Header avec scroll, Portfolio tabs,
 * ContactForm, NewsletterForm) sont isolés.
 *
 * ISR cible : 1h (à activer Phase 1.5 quand contenu DB stable).
 */

import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { EngagementSection } from "@/components/landing/engagement-section";
import { ServicesSection } from "@/components/landing/services-section";
import { PortfolioSection } from "@/components/landing/portfolio-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { ContactSection } from "@/components/landing/contact-section";
import { FinalCTA } from "@/components/landing/final-cta";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <EngagementSection />
        <ServicesSection />
        <PortfolioSection />
        <TestimonialsSection />
        <ContactSection />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}
