/**
 * PortfolioSection — Server Component.
 *
 * Fetch les photos portfolio (ServicePhoto featured=false) groupées par
 * catégorie, et délègue le filtering interactif au Client subcomponent.
 *
 * Si aucune photo n'est uploadée, affiche un placeholder hachuré (legacy).
 */

import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PortfolioGallery, type PortfolioGalleryPhoto } from "./portfolio-gallery";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  POSE_NATURELS: "Ongles naturels",
  RALLONGEMENT: "Rallongements",
  PACK_SPECIAL: "Packs",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};

export async function PortfolioSection() {
  const photos: PortfolioGalleryPhoto[] = await prisma.servicePhoto.findMany({
    where: { featured: false },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      category: true,
      variants: true,
    },
  });

  // Catégories effectivement présentes
  const presentCats: ServiceCategory[] = Array.from(
    new Set(photos.map((p) => p.category)),
  );

  return (
    <section
      id="portfolio"
      className="bg-[var(--color-rose-50)]/50 border-y border-[var(--color-line)]"
    >
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28">
        {/* Header */}
        <div className="text-center max-w-[36rem] mx-auto mb-10">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Réalisations
          </p>
          <h2
            className="mt-4 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Portfolio
          </h2>
        </div>

        {photos.length === 0 ? (
          <EmptyPlaceholder />
        ) : (
          <PortfolioGallery
            photos={photos}
            categories={presentCats.map((c) => ({
              id: c,
              label: CATEGORY_LABELS[c],
            }))}
          />
        )}
      </div>
    </section>
  );
}

function EmptyPlaceholder() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="relative aspect-square rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)]"
          style={{
            backgroundColor: "var(--color-rose-100)",
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(202,160,166,0.5) 0, rgba(202,160,166,0.5) 1px, transparent 1px, transparent 14px)",
          }}
        />
      ))}
    </div>
  );
}
