/**
 * SiteFooter — Server Component avec NewsletterForm Client.
 */

import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";
import { CookieSettingsLink } from "@/components/cookie-consent/cookie-settings-link";

export function SiteFooter() {
  return (
    <footer className="bg-[var(--color-cream)] border-t border-[var(--color-line)]">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-14 pb-8">
        <div className="grid lg:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="w-8 h-8 rounded-full bg-[var(--color-violet-600)] grid place-items-center text-white text-sm"
                style={{ fontFamily: "var(--font-serif)" }}
                aria-hidden="true"
              >
                C
              </span>
              <span
                className="text-lg"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Clochette Nails
              </span>
            </div>
            <p className="text-sm text-[var(--color-ink-500)] max-w-[36ch] leading-relaxed">
              Studio de prothésie ongulaire à Moncoutant-sur-Sèvre, par Chloé.
              Sur rendez-vous, du mardi au samedi.
            </p>
          </div>

          {/* Salon */}
          <div className="lg:col-span-2">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Salon
            </p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href="/prestations"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Prestations
                </Link>
              </li>
              <li>
                <Link
                  href="/#portfolio"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Portfolio
                </Link>
              </li>
              <li>
                <Link
                  href="/reservation"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Réserver
                </Link>
              </li>
              <li>
                <Link
                  href="/cartes-cadeau"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Cartes cadeau
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Journal
                </Link>
              </li>
              <li>
                <Link
                  href="/ebooks"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Ebooks
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="lg:col-span-3">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Contact
            </p>
            <ul
              className="space-y-2.5 text-sm text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              <li className="flex items-start gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="mt-1 shrink-0 text-[var(--color-ink-500)]"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Moncoutant-sur-Sèvre 79320</span>
              </li>
              <li className="flex items-start gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="mt-1 shrink-0 text-[var(--color-ink-500)]"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <a
                  href="tel:0688686699"
                  className="hover:text-[var(--color-violet-700)]"
                >
                  06 88 68 66 99
                </a>
              </li>
              <li className="flex items-start gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="mt-1 shrink-0 text-[var(--color-ink-500)]"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M2 7l10 7L22 7" />
                </svg>
                <a
                  href="mailto:contact@clochette-nails.fr"
                  className="hover:text-[var(--color-violet-700)] break-all"
                >
                  contact@clochette-nails.fr
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-3">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Lettre du salon
            </p>
            <p className="text-sm text-[var(--color-ink-500)] mb-3">
              Une attention par mois, pas plus.
            </p>
            <NewsletterForm />
          </div>
        </div>

        {/* Bottom row */}
        <div
          className="mt-12 pt-6 border-t border-[var(--color-line)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <p>© {new Date().getFullYear()} Clochette Nails — Tous droits réservés.</p>
          <div className="flex flex-wrap items-center gap-x-6 sm:gap-x-8 gap-y-3">
            <Link href="/mentions-legales" className="hover:text-[var(--color-ink-900)] transition-colors">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="hover:text-[var(--color-ink-900)] transition-colors">
              Confidentialité
            </Link>
            <CookieSettingsLink />
            <a
              href="https://www.instagram.com/clochette_nails_79/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="hover:text-[var(--color-ink-900)] transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
