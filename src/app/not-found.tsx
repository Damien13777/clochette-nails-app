/**
 * /404 — page custom servie pour toute route inexistante.
 *
 * Server Component (par défaut). Garde le SiteHeader + SiteFooter pour
 * cohérence de nav et donner à l'utilisateur des sorties claires.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = {
  title: "Page introuvable",
  description: "Cette page n'existe pas ou plus.",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-[var(--color-cream)] min-h-[60vh] flex items-center">
        <div className="max-w-[920px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-20 md:pb-28 text-center">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] flex items-center justify-center gap-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span
              className="inline-block w-9 h-px bg-[var(--color-violet-300)]"
              aria-hidden="true"
            />
            Erreur 404
            <span
              className="inline-block w-9 h-px bg-[var(--color-violet-300)]"
              aria-hidden="true"
            />
          </p>

          <h1
            className="mt-6 text-[clamp(3rem,8vw,5.5rem)] leading-none text-[var(--color-violet-700)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            404
          </h1>

          <p
            className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] leading-tight"
            style={{
              fontFamily: "var(--font-sans)",
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            Cette page semble s&apos;être <em>évaporée</em>
          </p>

          <p
            className="mt-6 text-sm md:text-base text-[var(--color-ink-700)] leading-relaxed max-w-md mx-auto"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Le lien que vous avez suivi est peut-être incorrect, ou cette
            prestation n&apos;est plus en ligne. Pas de panique — voici par où
            continuer.
          </p>

          <nav
            aria-label="Continuer la navigation"
            className="mt-10 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 justify-center"
          >
            <Link
              href="/reservation"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all whitespace-nowrap"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prendre rendez-vous
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-all whitespace-nowrap"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Retour à l&apos;accueil
            </Link>
            <Link
              href="/prestations"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] hover:border-[var(--color-violet-100)] transition-all whitespace-nowrap"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Voir les prestations
            </Link>
            <Link
              href="/#portfolio"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] hover:border-[var(--color-violet-100)] transition-all whitespace-nowrap"
              style={{ fontFamily: "var(--font-display)" }}
            >
              En manque d&apos;inspiration ?
            </Link>
          </nav>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
