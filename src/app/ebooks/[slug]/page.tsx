/**
 * /ebooks/[slug] — Détail d'un ebook + formulaire d'achat.
 *
 * SEO complet (title, description, OG, canonical, JSON-LD Product) +
 * description longue rendue via TipTap → DOMPurify.
 */

import { safeJsonLd } from "@/lib/jsonld";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { EbookPurchaseForm } from "./purchase-form";
import { breadcrumbJsonLd } from "@/lib/seo-jsonld";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const e = await prisma.ebook.findUnique({
    where: { slug },
    select: {
      title: true,
      metaTitle: true,
      metaDesc: true,
      shortDesc: true,
      coverImage: true,
      status: true,
      tags: true,
    },
  });
  if (!e || e.status !== "PUBLISHED") {
    return { title: "Ebook introuvable", robots: { index: false } };
  }

  const title = e.metaTitle ?? e.title;
  const description = e.metaDesc ?? e.shortDesc;
  const ogImage = e.coverImage ? `${SITE_URL}${e.coverImage}` : undefined;

  return {
    title: { absolute: `${title} — Clochette Nails` },
    description,
    alternates: { canonical: `/ebooks/${slug}` },
    keywords: e.tags.length > 0 ? e.tags : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      url: `${SITE_URL}/ebooks/${slug}`,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function EbookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ annule?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const ebook = await prisma.ebook.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      description: true,
      coverImage: true,
      coverImageAlt: true,
      priceCents: true,
      comparePriceCents: true,
      status: true,
      pdfUrl: true,
      pdfSizeBytes: true,
      metaDesc: true,
      tags: true,
    },
  });
  if (
    !ebook ||
    ebook.status !== "PUBLISHED" ||
    !ebook.pdfUrl ||
    ebook.priceCents <= 0
  ) {
    notFound();
  }

  const sanitized = sanitizeHtml(ebook.description);
  const cancelled = sp.annule === "1";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: ebook.title,
    description: ebook.metaDesc ?? ebook.shortDesc,
    image: ebook.coverImage ? [`${SITE_URL}${ebook.coverImage}`] : undefined,
    brand: { "@type": "Brand", name: "Clochette Nails" },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/ebooks/${ebook.slug}`,
      priceCurrency: "EUR",
      price: (ebook.priceCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <>
      <SiteHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Accueil", path: "/" },
              { name: "Ebooks", path: "/ebooks" },
              { name: ebook.title, path: `/ebooks/${ebook.slug}` },
            ]),
          ),
        }}
      />

      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
        <div className="max-w-[1100px] mx-auto px-5 lg:px-8">
          {/* Back link */}
          <Link
            href="/ebooks"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] transition-colors mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Tous les ebooks
          </Link>

          {cancelled && (
            <p
              className="mb-6 text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Paiement annulé. Tu peux reprendre l&apos;achat ci-dessous.
            </p>
          )}

          <div className="grid lg:grid-cols-[400px_1fr] gap-10">
            {/* Visuel + résumé */}
            <div className="space-y-5">
              <div className="aspect-[4/5] rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-line)] bg-[var(--color-bone)] sticky top-32">
                {ebook.coverImage ? (
                  <Image
                    src={ebook.coverImage}
                    alt={ebook.coverImageAlt ?? ebook.title}
                    width={500}
                    height={625}
                    priority
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[var(--color-ink-300)] text-xs uppercase tracking-[0.18em]">
                    Ebook
                  </div>
                )}
              </div>
            </div>

            {/* Contenu */}
            <div className="space-y-8">
              <header className="space-y-3">
                <h1
                  className="text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight text-[var(--color-ink-900)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {ebook.title}
                </h1>
                <p
                  className="text-base text-[var(--color-ink-700)] leading-relaxed"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {ebook.shortDesc}
                </p>
                <div className="flex items-baseline gap-3 pt-2">
                  {ebook.comparePriceCents && (
                    <span
                      className="text-base line-through text-[var(--color-ink-500)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {formatCents(ebook.comparePriceCents)}
                    </span>
                  )}
                  <span
                    className="text-3xl text-[var(--color-violet-700)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {formatCents(ebook.priceCents)}
                  </span>
                  {ebook.pdfSizeBytes && (
                    <span
                      className="text-xs text-[var(--color-ink-500)] ml-auto"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      PDF · {(ebook.pdfSizeBytes / 1024 / 1024).toFixed(1)} Mo
                    </span>
                  )}
                </div>
              </header>

              {/* Description longue */}
              <article
                className="rich-content max-w-none text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-ui)" }}
                dangerouslySetInnerHTML={{ __html: sanitized }}
              />

              {/* Formulaire achat */}
              <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
                <h2
                  className="text-xl"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Acheter cet ebook
                </h2>
                <EbookPurchaseForm
                  ebookSlug={ebook.slug}
                  ebookTitle={ebook.title}
                  ebookPriceCents={ebook.priceCents}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}
