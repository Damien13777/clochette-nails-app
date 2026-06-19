/**
 * Landing — / (page d'accueil publique)
 *
 * Server Component qui orchestre les sections. La plupart sont
 * Server-rendered ; les îlots Client (Header avec scroll, Portfolio tabs,
 * ContactForm, NewsletterForm) sont isolés.
 *
 * Rendu dynamique (force-dynamic) pour refléter en direct le contenu admin
 * (photos hero/prestations, avis, settings). ISR envisageable plus tard.
 */

import type { Metadata } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { EngagementSection } from "@/components/landing/engagement-section";
import { ServicesSection } from "@/components/landing/services-section";
import { PortfolioSection } from "@/components/landing/portfolio-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { ContactSection } from "@/components/landing/contact-section";
import { FinalCTA } from "@/components/landing/final-cta";
import { SiteFooter } from "@/components/landing/site-footer";
import { LocalBusinessJsonLd } from "@/components/landing/local-business-jsonld";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic"; // contenu admin live (photos, prestations, avis) — pas d'ISR pour V1

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "Clochette Nails · Prothésiste ongulaire à Moncoutant-sur-Sèvre",
    description:
      "Salon de prothésie ongulaire à Moncoutant-sur-Sèvre. Manucure russe, pose semi-permanente et nail-art, sur rendez-vous.",
    url: "/",
    type: "website",
    locale: "fr_FR",
    siteName: "Clochette Nails",
  },
};

export default async function HomePage() {
  return (
    <>
      <LocalBusinessJsonLd />
      <SiteHeader />
      <main>
        <Hero />
        <Reveal className="section-soft section-monogram border-y border-[var(--color-line)]">
          <EngagementSection />
        </Reveal>
        <Reveal>
          <ServicesSection />
        </Reveal>
        <Reveal>
          <PortfolioSection />
        </Reveal>
        <Reveal className="section-soft section-monogram border-y border-[var(--color-line)]">
          <TestimonialsSection />
        </Reveal>
        <Reveal>
          <ContactSection />
        </Reveal>
        <Reveal className="section-cta border-y border-[var(--color-violet-100)]">
          <FinalCTA />
        </Reveal>
      </main>
      <SiteFooter />
    </>
  );
}
