/**
 * /ebooks — Liste publique des ebooks à acheter.
 *
 * Affiche uniquement les ebooks PUBLISHED qui ont un PDF.
 * Respecte le feature flag `ebooksEnabled` côté PlatformSettings.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { thumbUrl } from "@/lib/upload-thumb";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ebooks — Clochette Nails",
  description:
    "Guides et conseils sur l'entretien des ongles, la pose semi-permanente et le soin des mains, par Chloé.",
  alternates: { canonical: "/ebooks" },
  openGraph: {
    type: "website",
    title: "Ebooks — Clochette Nails",
    description:
      "Guides pour prendre soin de ses ongles entre deux rendez-vous, par Chloé.",
  },
};

export default async function EbooksIndexPage() {
  const settings = await prisma.platformSettings.findFirst({
    select: { ebooksEnabled: true },
  });
  if (settings && !settings.ebooksEnabled) {
    return <EbooksDisabled />;
  }

  const ebooks = await prisma.ebook.findMany({
    where: { status: "PUBLISHED", pdfUrl: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      coverImage: true,
      coverImageAlt: true,
      priceCents: true,
      comparePriceCents: true,
    },
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-8">
          <header className="text-center mb-12 max-w-2xl mx-auto">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-violet-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ebooks
            </p>
            <h1
              className="mt-4 text-[clamp(2rem,4vw,3rem)] leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Guides &{" "}
              <em className="text-[var(--color-violet-700)]">conseils</em>
            </h1>
            <p
              className="mt-4 text-sm text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Des ebooks pour prolonger votre pose, prendre soin de vos mains
              au quotidien et adopter les bons gestes entre deux rendez-vous.
            </p>
          </header>

          {ebooks.length === 0 ? (
            <div className="text-center py-12">
              <p
                className="text-sm text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Aucun ebook disponible pour le moment. Revenez bientôt !
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {ebooks.map((e, i) => (
                <li key={e.id}>
                  <Link
                    href={`/ebooks/${e.slug}`}
                    className="group block bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden h-full transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
                  >
                    <div className="aspect-[4/5] bg-[var(--color-bone)] overflow-hidden">
                      {e.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrl(e.coverImage)}
                          alt={e.coverImageAlt ?? e.title}
                          width={500}
                          height={625}
                          fetchPriority={i === 0 ? "high" : undefined}
                          loading={i === 0 ? "eager" : "lazy"}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[var(--color-ink-300)] text-xs uppercase tracking-[0.18em]">
                          Ebook
                        </div>
                      )}
                    </div>
                    <div className="p-5 space-y-3">
                      <h2
                        className="text-lg leading-tight text-[var(--color-ink-900)]"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {e.title}
                      </h2>
                      <p
                        className="text-sm text-[var(--color-ink-500)] line-clamp-3"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {e.shortDesc}
                      </p>
                      <div className="flex items-baseline gap-2 pt-2 border-t border-[var(--color-line)]">
                        {e.comparePriceCents && (
                          <span
                            className="text-xs line-through text-[var(--color-ink-500)]"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            {formatCents(e.comparePriceCents)}
                          </span>
                        )}
                        <span
                          className="text-lg text-[var(--color-violet-700)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {formatCents(e.priceCents)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function EbooksDisabled() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="text-center max-w-md">
        <h1
          className="text-3xl mb-4"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Les ebooks reviennent bientôt
        </h1>
        <p className="text-[var(--color-ink-500)]">
          La boutique d’ebooks est temporairement indisponible.
        </p>
      </div>
    </main>
  );
}
