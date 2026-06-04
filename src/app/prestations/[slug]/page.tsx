/**
 * /prestations/[slug] — Page détail d'une prestation.
 *
 * Server Component qui fetch un service par slug + relations utiles :
 *   - Cover photo (ServicePhoto featured)
 *   - Autres photos du service (non-featured pour galerie)
 *   - Options compatibles avec la catégorie
 *   - Autres prestations de la même catégorie (related, jusqu'à 3)
 *
 * 404 si service inexistant ou non PUBLISHED.
 * SEO : title/desc/canonical/og:image. PostPurchaseInfo affiché en bas si présent.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { buildSrcSet } from "@/lib/image-srcset";
import { PrestationGallery } from "@/components/prestation-gallery";
import { breadcrumbJsonLd } from "@/lib/seo-jsonld";
import { Reveal } from "@/components/reveal";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  POSE_NATURELS: "Pose sur ongles naturels",
  RALLONGEMENT: "Rallongement",
  PACK_SPECIAL: "Pack sur mesure",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const svc = await prisma.service.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      title: true,
      shortDesc: true,
      metaTitle: true,
      metaDesc: true,
      photos: {
        where: { featured: true },
        take: 1,
        select: { url: true, alt: true },
      },
    },
  });
  if (!svc) return { title: "Prestation introuvable" };
  const title = svc.metaTitle?.trim() || svc.title;
  const description = svc.metaDesc?.trim() || svc.shortDesc;
  const ogImage = svc.photos[0]?.url;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/prestations/${slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      ...(ogImage ? { images: [{ url: ogImage, alt: svc.photos[0].alt }] } : {}),
    },
  };
}

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const service = await prisma.service.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      description: true,
      category: true,
      durationMinutes: true,
      priceCents: true,
      metaDesc: true,
      tags: true,
      postPurchaseInfo: true,
      photos: {
        orderBy: [{ featured: "desc" }, { displayOrder: "asc" }],
        take: 8,
        select: {
          id: true,
          url: true,
          alt: true,
          caption: true,
          featured: true,
          variants: true,
        },
      },
    },
  });

  if (!service) notFound();

  const [cover, ...serviceOtherPhotos] = service.photos;
  const coverSrcSet = cover ? buildSrcSet(cover.variants) : undefined;

  // Photos portfolio de la même catégorie (taguées au global, pas à un service spécifique)
  const portfolioPhotos = await prisma.servicePhoto.findMany({
    where: {
      category: service.category,
      serviceId: null,
      featured: false,
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      variants: true,
    },
  });

  // Galerie = photos liées au service (hors cover) + photos portfolio de même catégorie,
  // déduplication par id et limite à 12.
  const seenIds = new Set(serviceOtherPhotos.map((p) => p.id));
  const otherPhotos = [
    ...serviceOtherPhotos,
    ...portfolioPhotos.filter((p) => !seenIds.has(p.id)),
  ].slice(0, 12);

  // Options compatibles avec cette catégorie
  const compatibleOptions = await prisma.serviceOption.findMany({
    where: {
      status: "PUBLISHED",
      applicableCategories: { has: service.category },
    },
    orderBy: { displayOrder: "asc" },
    take: 8,
    select: {
      id: true,
      title: true,
      description: true,
      addedDurationMinutes: true,
    },
  });

  // Autres prestations de la même catégorie
  const relatedServices = await prisma.service.findMany({
    where: {
      status: "PUBLISHED",
      category: service.category,
      id: { not: service.id },
    },
    orderBy: { displayOrder: "asc" },
    take: 3,
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      durationMinutes: true,
      photos: {
        where: { featured: true },
        take: 1,
        select: { url: true, alt: true, variants: true },
      },
    },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${SITE_URL}/prestations/${service.slug}#service`,
    name: service.title,
    description: service.metaDesc?.trim() || service.shortDesc,
    serviceType: CATEGORY_LABELS[service.category],
    category: CATEGORY_LABELS[service.category],
    url: `${SITE_URL}/prestations/${service.slug}`,
    ...(cover ? { image: `${SITE_URL}${cover.url}` } : {}),
    ...(service.tags.length > 0
      ? { keywords: service.tags.join(", ") }
      : {}),
    provider: {
      "@type": "BeautySalon",
      "@id": `${SITE_URL}/#beautysalon`,
      name: "Clochette Nails",
    },
    areaServed: { "@type": "City", name: "Moncoutant-sur-Sèvre" },
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: (service.priceCents / 100).toFixed(2),
      url: `${SITE_URL}/prestations/${service.slug}`,
      availability: "https://schema.org/InStock",
      businessFunction: "http://purl.org/goodrelations/v1#ProvideService",
      availableAtOrFrom: { "@id": `${SITE_URL}/#beautysalon` },
    },
    potentialAction: {
      "@type": "ReserveAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/reservation`,
        actionPlatform: [
          "https://schema.org/DesktopWebPlatform",
          "https://schema.org/MobileWebPlatform",
        ],
      },
      result: {
        "@type": "Reservation",
        name: `Réservation — ${service.title}`,
      },
    },
  };

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Accueil", path: "/" },
              { name: "Prestations", path: "/prestations" },
              { name: service.title, path: `/prestations/${service.slug}` },
            ]),
          ),
        }}
      />
      <main className="bg-[var(--color-cream)]">
        <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-16">
          {/* Back link */}
          <Link
            href="/prestations"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] mb-6 transition-colors"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Retour au catalogue
          </Link>

          {/* Hero : cover + résumé */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12 items-start">
            <div className="relative aspect-[4/3] lg:aspect-[4/5] rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-line)] order-1 lg:order-1">
              {cover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={cover.url}
                  srcSet={coverSrcSet}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  alt={cover.alt}
                  fetchPriority="high"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: "var(--color-rose-50)",
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(233,191,196,0.5) 0, rgba(233,191,196,0.5) 1px, transparent 1px, transparent 14px)",
                  }}
                />
              )}
            </div>

            <div className="order-2 lg:order-2 lg:py-4">
              <p
                className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] flex items-center gap-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span
                  className="inline-block w-9 h-px bg-[var(--color-violet-300)]"
                  aria-hidden="true"
                />
                {CATEGORY_LABELS[service.category]}
              </p>
              <h1
                className="mt-5 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {service.title}
              </h1>
              <p
                className="mt-5 text-base md:text-lg text-[var(--color-ink-700)] leading-relaxed"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {service.shortDesc}
              </p>

              <dl
                className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 max-w-md"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                <div>
                  <dt
                    className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Durée
                  </dt>
                  <dd
                    className="mt-1 text-base"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {formatDuration(service.durationMinutes)}
                  </dd>
                </div>
                <div>
                  <dt
                    className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Catégorie
                  </dt>
                  <dd
                    className="mt-1 text-base"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {CATEGORY_LABELS[service.category]}
                  </dd>
                </div>
              </dl>

              <Link
                href="/reservation"
                className="inline-flex items-center gap-2 mt-10 px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Réserver cette prestation
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <p
                className="mt-3 text-xs text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Acompte 30 % via Stripe · Annulation gratuite jusqu&apos;à 72h avant.
              </p>
            </div>
          </div>

          {/* Description longue */}
          <Reveal immediate>
          <section className="mt-16 md:mt-20 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10 lg:gap-16">
            <div>
              <h2
                className="text-[clamp(1.25rem,2vw,1.5rem)] mb-5 pb-3 border-b border-[var(--color-line)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Description
              </h2>
              <div
                className="space-y-4 text-base text-[var(--color-ink-700)] leading-relaxed whitespace-pre-wrap"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {service.description}
              </div>

              {service.tags.length > 0 && (
                <div className="mt-8 flex flex-wrap gap-2">
                  {service.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--color-bone)] text-[var(--color-ink-700)] text-[11px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Options compatibles */}
            {compatibleOptions.length > 0 && (
              <aside className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6">
                <h2
                  className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-4"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Options possibles
                </h2>
                <ul className="space-y-3">
                  {compatibleOptions.map((opt) => (
                    <li
                      key={opt.id}
                      className="flex items-start gap-3 pb-3 border-b border-[var(--color-line)] last:border-b-0 last:pb-0"
                    >
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-violet-600)]" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {opt.title}
                          <span
                            className="ml-2 text-xs text-[var(--color-ink-500)] whitespace-nowrap"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            +{opt.addedDurationMinutes} min
                          </span>
                        </p>
                        {opt.description && (
                          <p
                            className="text-xs text-[var(--color-ink-500)] mt-1 leading-relaxed"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            {opt.description}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <p
                  className="mt-5 pt-5 border-t border-[var(--color-line)] text-xs text-[var(--color-ink-500)] leading-relaxed"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Vous choisirez vos options au moment de la réservation.
                </p>
              </aside>
            )}
          </section>
          </Reveal>

          {/* Galerie photos (non-cover) */}
          {otherPhotos.length > 0 && (
            <Reveal>
            <section className="mt-16 md:mt-20">
              <h2
                className="text-[clamp(1.25rem,2vw,1.5rem)] mb-5 pb-3 border-b border-[var(--color-line)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                En images
              </h2>
              <PrestationGallery photos={otherPhotos} />
            </section>
            </Reveal>
          )}

          {/* Post-purchase info / conseils */}
          {service.postPurchaseInfo && (
            <Reveal>
            <section className="mt-16 md:mt-20 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 md:p-8">
              <h2
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                À savoir avant votre RDV
              </h2>
              <p
                className="text-sm md:text-base text-[var(--color-ink-700)] leading-relaxed whitespace-pre-wrap"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {service.postPurchaseInfo}
              </p>
            </section>
            </Reveal>
          )}

          {/* CTA final */}
          <Reveal>
          <section className="mt-16 md:mt-20 section-cta overflow-hidden border border-[var(--color-violet-100)] rounded-[var(--radius-md)] p-8 md:p-12 text-center">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prête à passer à l&apos;action ?
            </p>
            <h2
              className="mt-3 text-[clamp(1.5rem,3vw,2rem)] leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Réservez votre {service.title.toLowerCase()}
            </h2>
            <p
              className="mt-3 text-sm text-[var(--color-ink-500)] max-w-[42ch] mx-auto"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Choisissez votre créneau, ajoutez vos options et payez l&apos;acompte
              en quelques clics.
            </p>
            <Link
              href="/reservation"
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prendre rendez-vous
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </section>
          </Reveal>

          {/* Autres prestations de la catégorie */}
          {relatedServices.length > 0 && (
            <Reveal>
            <section className="mt-16 md:mt-20">
              <header className="flex items-end justify-between gap-4 mb-8">
                <h2
                  className="text-[clamp(1.25rem,2vw,1.5rem)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Vous aimerez aussi
                </h2>
                <Link
                  href="/prestations"
                  className="text-sm text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] inline-flex items-center gap-1 whitespace-nowrap"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Tout le catalogue →
                </Link>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                {relatedServices.map((s) => {
                  const c = s.photos[0] ?? null;
                  return (
                    <Link
                      key={s.id}
                      href={`/prestations/${s.slug}`}
                      className="group bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)] flex flex-col h-full"
                    >
                      <div
                        className="relative aspect-[4/3] overflow-hidden"
                        style={
                          c
                            ? undefined
                            : {
                                backgroundColor: "var(--color-rose-50)",
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, rgba(233,191,196,0.5) 0, rgba(233,191,196,0.5) 1px, transparent 1px, transparent 14px)",
                              }
                        }
                      >
                        {c && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={c.url}
                            srcSet={buildSrcSet(c.variants)}
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            alt={c.alt}
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
                          {s.title}
                        </h3>
                        <p
                          className="text-sm text-[var(--color-ink-700)] mt-2 pb-4 leading-relaxed line-clamp-3"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {s.shortDesc}
                        </p>
                        <div className="mt-auto pt-5 flex items-center justify-between border-t border-[var(--color-line)]">
                          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                            {formatDuration(s.durationMinutes)}
                          </span>
                          <span
                            className="text-xs text-[var(--color-violet-700)] inline-flex items-center gap-1 group-hover:gap-2 transition-all"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            Voir le détail
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
            </Reveal>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
