/**
 * /prestations — Catalogue public des prestations.
 *
 * Affiche TOUS les services en status PUBLISHED, groupés par catégorie.
 * Chaque catégorie = section avec H2 (SEO + structure).
 * Cards cliquables → /prestations/[slug] pour le détail.
 *
 * Pas de prix affiché (politique salon — visible seulement dans le tunnel résa).
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { buildSrcSet } from "@/lib/image-srcset";

export const metadata: Metadata = {
  title: "Prestations · Manucure & soin des ongles",
  description:
    "Découvrez l'ensemble des prestations Clochette Nails : pose ongles naturels, rallongements, soins des mains et des pieds, dépose. Studio à Moncoutant-sur-Sèvre.",
  alternates: { canonical: "/prestations" },
};

export const dynamic = "force-dynamic"; // data live, pas d'ISR pour V1

const CATEGORY_META: Record<
  ServiceCategory,
  { label: string; intro: string; order: number }
> = {
  POSE_NATURELS: {
    label: "Ongles naturels",
    intro: "Renforcement et embellissement de l'ongle naturel, en finition discrète.",
    order: 1,
  },
  RALLONGEMENT: {
    label: "Rallongements",
    intro: "Extensions sur mesure, formes amande, ballerine ou stiletto.",
    order: 2,
  },
  PACK_SPECIAL: {
    label: "Packs sur mesure",
    intro: "Combinaisons exclusives pour vos occasions : mariage, événements, séries.",
    order: 3,
  },
  SOIN_MAINS: {
    label: "Soin des mains",
    intro: "Manucure russe, soin des cuticules, hydratation profonde.",
    order: 4,
  },
  SOIN_PIEDS: {
    label: "Soin des pieds",
    intro: "Beauté et confort des pieds, du pédicure au soin complet.",
    order: 5,
  },
  DEPOSE: {
    label: "Dépose",
    intro: "Retrait soigneux d'une pose existante (gel, semi, capsules).",
    order: 6,
  },
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export default async function PrestationsPage() {
  const services = await prisma.service.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      category: true,
      durationMinutes: true,
      photos: {
        where: { featured: true },
        take: 1,
        select: { url: true, alt: true, variants: true },
      },
    },
  });

  // Groupe par catégorie + tri par order défini
  const grouped = new Map<ServiceCategory, typeof services>();
  for (const svc of services) {
    if (!grouped.has(svc.category)) grouped.set(svc.category, []);
    grouped.get(svc.category)!.push(svc);
  }
  const orderedCategories = Array.from(grouped.keys()).sort(
    (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order,
  );

  return (
    <>
      <SiteHeader />
      <main className="bg-[var(--color-cream)]">
        {/* Header / intro */}
        <section className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-12 md:pb-16">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] flex items-center gap-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span
              className="inline-block w-9 h-px bg-[var(--color-violet-300)]"
              aria-hidden="true"
            />
            Catalogue
          </p>
          <h1
            className="mt-6 text-[clamp(2.27rem,5.5vw,3.63rem)] leading-[1.05] tracking-[0.02em]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            LES PRESTATIONS
          </h1>
          <p
            className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] text-[var(--color-violet-700)] -mt-1"
            style={{
              fontFamily: "var(--font-sans)",
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            Toutes les possibilités du studio
          </p>
          <p
            className="mt-6 text-sm md:text-base text-[var(--color-ink-700)] max-w-[60ch] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Chaque prestation est réalisée avec précision en cabine privée à
            Moncoutant-sur-Sèvre. Sélectionnez celle qui vous correspond, ajoutez
            vos options et choisissez votre créneau en ligne.
          </p>
        </section>

        {/* Sous-nav sticky par catégorie — visible mobile + desktop */}
        {orderedCategories.length > 1 && (
          <nav
            aria-label="Catégories"
            className="sticky top-16 z-30 bg-[var(--color-cream)]/95 backdrop-blur-md"
          >
            <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12">
              <div className="flex gap-2 overflow-x-auto md:flex-wrap py-3 -mx-5 md:mx-0 px-5 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {orderedCategories.map((cat) => (
                  <a
                    key={cat}
                    href={`#${cat.toLowerCase()}`}
                    className="shrink-0 inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-paper)] border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] hover:text-[var(--color-violet-700)] hover:border-[var(--color-violet-100)] transition-colors"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {CATEGORY_META[cat].label}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        )}

        {/* Sections par catégorie */}
        {services.length === 0 ? (
          <section className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pb-20">
            <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
              <p
                className="text-sm text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Aucune prestation publiée pour le moment. Revenez bientôt !
              </p>
            </div>
          </section>
        ) : (
          <div className="pt-10 md:pt-14 pb-20 md:pb-28 space-y-16 md:space-y-20">
            {orderedCategories.map((cat) => (
              <section
                key={cat}
                id={cat.toLowerCase()}
                className="scroll-mt-32 md:scroll-mt-40 max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12"
              >
                <header className="mb-8 md:mb-10 max-w-[44rem]">
                  <p
                    className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Catégorie
                  </p>
                  <h2
                    className="mt-3 text-[clamp(1.5rem,3vw,2.25rem)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {CATEGORY_META[cat].label}
                  </h2>
                  <p
                    className="mt-2 text-sm md:text-base text-[var(--color-ink-700)] leading-relaxed"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {CATEGORY_META[cat].intro}
                  </p>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                  {grouped.get(cat)!.map((svc) => {
                    const cover = svc.photos[0] ?? null;
                    return (
                      <Link
                        key={svc.id}
                        href={`/prestations/${svc.slug}`}
                        className="group bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)] flex flex-col h-full"
                      >
                        <div
                          className="relative aspect-[4/3] overflow-hidden"
                          style={
                            cover
                              ? undefined
                              : {
                                  backgroundColor: "var(--color-rose-50)",
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, rgba(233,191,196,0.5) 0, rgba(233,191,196,0.5) 1px, transparent 1px, transparent 14px)",
                                }
                          }
                        >
                          {cover && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={cover.url}
                              srcSet={buildSrcSet(cover.variants)}
                              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                              alt={cover.alt}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          )}
                        </div>

                        <div className="p-5 flex-1 flex flex-col">
                          <h3
                            className="text-lg leading-tight"
                            style={{ fontFamily: "var(--font-serif)" }}
                          >
                            {svc.title}
                          </h3>
                          <p
                            className="text-sm text-[var(--color-ink-700)] mt-2 pb-4 leading-relaxed line-clamp-3"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            {svc.shortDesc}
                          </p>
                          <div className="mt-auto pt-5 flex items-center justify-between border-t border-[var(--color-line)]">
                            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)]">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                              </svg>
                              {formatDuration(svc.durationMinutes)}
                            </span>
                            <span
                              className="text-xs text-[var(--color-violet-700)] inline-flex items-center gap-1 group-hover:gap-2 transition-all"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              Voir le détail
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              >
                                <path d="M5 12h14M13 5l7 7-7 7" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* CTA bas de page */}
            <section className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12">
              <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-12 text-center">
                <p
                  className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Prête à réserver ?
                </p>
                <h2
                  className="mt-3 text-[clamp(1.5rem,3vw,2rem)] leading-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Choisissez votre prestation et votre créneau en ligne
                </h2>
                <p
                  className="mt-3 text-sm text-[var(--color-ink-500)] max-w-[40ch] mx-auto"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Acompte 30 % via Stripe, annulation gratuite jusqu&apos;à 72h
                  avant le RDV.
                </p>
                <Link
                  href="/reservation"
                  className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Prendre rendez-vous
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
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
