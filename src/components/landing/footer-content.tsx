/**
 * FooterContent — rendu présentation du footer (sans dépendance serveur).
 *
 * Volontairement SANS import Prisma : il est rendu aussi bien depuis le
 * Server Component `SiteFooter` (qui lui passe les `socials` lus en DB) que
 * depuis des Client Components (ex. `error.tsx`, error boundary obligatoirement
 * "use client") où il est rendu sans réseaux sociaux. Sortir le fetch d'ici
 * évite de bundler `pg` côté navigateur (erreurs dns/fs/net/tls).
 */

import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";
import { CookieSettingsLink } from "@/components/cookie-consent/cookie-settings-link";

export type FooterSocial = { key: string; label: string; url: string };

// Glyphes de marque (simple-icons, viewBox 24, fill currentColor). Chaque
// réseau n'est rendu que si son URL est renseignée dans PlatformSettings.
const SOCIAL_ICONS: Record<string, string> = {
  instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  pinterest:
    "M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z",
};

export function FooterContent({
  socials = [],
}: {
  socials?: FooterSocial[];
}) {
  return (
    <footer className="bg-[var(--color-cream)] border-t border-[var(--color-line)]">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-14 pb-8">
        <div className="grid lg:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="lg:col-span-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/lockup-horizontal-couleur.svg"
              alt="Clochette Nails"
              className="h-16 w-auto mb-4"
            />
            <p className="text-sm text-[var(--color-ink-500)] max-w-[36ch] leading-relaxed">
              Salon de prothésie ongulaire à Moncoutant-sur-Sèvre. Je vous
              accueille sur rendez-vous, du lundi au samedi sauf le mercredi.
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
                  href="/realisations"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Réalisations
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
            {socials.length > 0 && (
              <div className="flex items-center gap-3">
                {socials.map((s) => (
                  <a
                    key={s.key}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="hover:text-[var(--color-violet-700)] transition-colors"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={SOCIAL_ICONS[s.key]} />
                    </svg>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Signature auteur — Studio G4. CONSTANTE sur toutes les instances du
            produit (crédit développeur, pas du branding client → ne pas rendre
            paramétrable). Lien vers la vitrine Studio G4 (en ligne depuis 06/2026). */}
        <a
          href="https://studiogquatre.fr"
          target="_blank"
          rel="noopener"
          aria-label="Studio G4 — conception et développement (ouvre le site dans un nouvel onglet)"
          className="group mt-8 flex items-center justify-center gap-2.5"
        >
          <span
            className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] transition-colors group-hover:text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Conçu &amp; développé par
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/studio-g4-encre.svg"
            alt="Studio G4"
            className="h-8 w-auto opacity-90 transition-opacity group-hover:opacity-100"
          />
        </a>
      </div>
    </footer>
  );
}
