/**
 * FinalCTA — bandeau full-width violet-100 avec H2 et bouton.
 */

import Link from "next/link";

export function FinalCTA() {
  return (
    <section className="bg-[var(--color-violet-100)]/55 border-y border-[var(--color-violet-100)]">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28 text-center">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-violet-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          On se retrouve au salon ?
        </p>
        <h2
          className="mt-4 text-[clamp(1.375rem,2.8vw,2rem)] uppercase tracking-[0.04em] whitespace-nowrap"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          PRÊTE À <span className="text-[var(--color-violet-700)]">PRENDRE RENDEZ-VOUS</span> ?
        </h2>
        <p
          className="mt-5 text-[var(--color-ink-700)] max-w-[44ch] mx-auto leading-relaxed"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Choisissez votre prestation, votre créneau et réservez en quelques
          minutes. Acompte sécurisé via Stripe.
        </p>
        <Link
          href="/reservation"
          className="mt-8 inline-flex items-center gap-2 px-7 py-4 rounded-full bg-[var(--color-violet-600)] text-white text-sm uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Réserver maintenant
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
