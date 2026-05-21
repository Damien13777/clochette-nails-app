/**
 * Wrapper partagé pour les pages légales (CGV / Confidentialité / Mentions).
 *
 * Inclut le site header + footer pour cohérence de navigation.
 * Table des matières automatique depuis les <section id="..."> du contenu.
 * Typographie éditoriale (serif headings + ui body).
 */

import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

type TocItem = { id: string; label: string };

type Props = {
  title: string;
  lastUpdate: string;
  toc: TocItem[];
  children: React.ReactNode;
};

export function LegalLayout({ title, lastUpdate, toc, children }: Props) {
  return (
    <>
      <SiteHeader />
      <main className="bg-[var(--color-cream)]">
        <div className="max-w-[900px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-20 md:pb-28">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] mb-6 transition-colors"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Retour à l&apos;accueil
          </Link>

          <header className="mb-10">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Informations légales
            </p>
            <h1
              className="mt-4 text-[clamp(2rem,4vw,2.75rem)] leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {title}
            </h1>
            <p
              className="mt-3 text-sm text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Dernière mise à jour : {lastUpdate}
            </p>
          </header>

          {toc.length > 0 && (
            <nav
              aria-label="Table des matières"
              className="mb-12 p-5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)]"
            >
              <p
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Sommaire
              </p>
              <ol
                className="space-y-1.5 text-sm"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {toc.map((item, idx) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="inline-flex items-baseline gap-2 text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
                    >
                      <span className="text-[var(--color-ink-500)] tabular-nums">
                        {String(idx + 1).padStart(2, "0")}.
                      </span>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <article className="legal-prose space-y-10">{children}</article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Composant utilitaire pour structurer une section légale avec son ancre.
 * Style éditorial cohérent : serif heading + ui body + spacing.
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2
        className="text-[clamp(1.25rem,2vw,1.5rem)] mb-4 pb-3 border-b border-[var(--color-line)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h2>
      <div
        className="space-y-4 text-[15px] leading-relaxed text-[var(--color-ink-700)] [&_strong]:text-[var(--color-ink-900)] [&_a]:text-[var(--color-violet-700)] [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Bloc visuellement distinct pour les valeurs à compléter par la patronne.
 * Apparaît clairement en jaune pour signaler "à remplacer avant prod".
 */
export function LegalTodo({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] text-xs"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {children}
    </span>
  );
}
