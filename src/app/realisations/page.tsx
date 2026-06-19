/**
 * /realisations — Galerie complète des réalisations (portfolio public).
 *
 * Toutes les photos portfolio (ServicePhoto featured=false), filtrables par
 * catégorie, rendues par paquets de 24 ("Voir plus"), lightbox au clic.
 *
 * SEO : title court local + meta description, OG/Twitter avec une vraie photo
 * (1ʳᵉ du portfolio) au lieu du logo, JSON-LD ImageGallery (Google Images) +
 * BreadcrumbList. Canonical + entrée sitemap. Page indexable.
 */
import type { Metadata } from "next";
import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { PortfolioGallery } from "@/components/portfolio/portfolio-gallery";
import { CATEGORY_LABELS, type PortfolioPhoto } from "@/components/portfolio/types";
import { getVariantUrl } from "@/lib/image-srcset";
import { safeJsonLd } from "@/lib/jsonld";
import { SITE_URL, breadcrumbJsonLd } from "@/lib/seo-jsonld";

export const dynamic = "force-dynamic";

const PAGE_TITLE = "Réalisations nail art à Moncoutant";
const PAGE_DESCRIPTION =
  "Découvrez les réalisations de Clochette Nails : manucure russe, pose semi-permanente, rallongements et nail-art. Salon de prothésie ongulaire à Moncoutant-sur-Sèvre.";

export async function generateMetadata(): Promise<Metadata> {
  const first = await prisma.servicePhoto.findFirst({
    where: { featured: false },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: { url: true, alt: true, variants: true },
  });
  const ogImage = first ? getVariantUrl(first.variants, "large") ?? first.url : null;

  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: { canonical: "/realisations" },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: "/realisations",
      type: "website",
      ...(ogImage
        ? {
            images: [
              { url: ogImage, alt: first?.alt ?? "Réalisation Clochette Nails" },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function RealisationsPage() {
  const photos: PortfolioPhoto[] = await prisma.servicePhoto.findMany({
    where: { featured: false },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      category: true,
      variants: true,
    },
  });
  const presentCats: ServiceCategory[] = Array.from(
    new Set(photos.map((p) => p.category)),
  );

  const breadcrumb = breadcrumbJsonLd([
    { name: "Accueil", path: "/" },
    { name: "Réalisations", path: "/realisations" },
  ]);

  const galleryJsonLd =
    photos.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ImageGallery",
          name: "Réalisations — Clochette Nails",
          description:
            "Galerie des réalisations de Clochette Nails, salon de prothésie ongulaire à Moncoutant-sur-Sèvre.",
          url: `${SITE_URL}/realisations`,
          image: photos.slice(0, 50).map((p) => ({
            "@type": "ImageObject",
            contentUrl: `${SITE_URL}${getVariantUrl(p.variants, "large") ?? p.url}`,
            thumbnailUrl: `${SITE_URL}${getVariantUrl(p.variants, "thumb") ?? p.url}`,
            name: p.alt,
            ...(p.caption ? { caption: p.caption } : {}),
          })),
        }
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      {galleryJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(galleryJsonLd) }}
        />
      )}

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
            Galerie
          </p>
          <h1
            className="mt-6 text-[clamp(2.27rem,5.5vw,3.63rem)] leading-[1.05] tracking-[0.02em]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            RÉALISATIONS
          </h1>
          <p
            className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] text-[var(--color-violet-700)] -mt-1"
            style={{
              fontFamily: "var(--font-sans)",
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            Le travail de Chloé en images
          </p>
        </section>

        {/* Galerie */}
        <section className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pb-20 md:pb-28">
          {photos.length === 0 ? (
            <p
              className="text-center text-sm text-[var(--color-ink-500)] py-16"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Les premières réalisations arrivent bientôt.
            </p>
          ) : (
            <PortfolioGallery
              photos={photos}
              categories={presentCats.map((c) => ({
                id: c,
                label: CATEGORY_LABELS[c],
              }))}
            />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
