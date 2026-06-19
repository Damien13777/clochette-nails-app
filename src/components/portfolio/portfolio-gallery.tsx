"use client";

/**
 * Galerie portfolio complète (/realisations) : filtres + grille + load-more.
 * Le serveur envoie toutes les photos ; on en rend PAGE_SIZE (24) et
 * « Voir plus » révèle les 24 suivantes. Images lazy. Clic → lightbox
 * (navigation sur tout le set filtré, même au-delà du rendu).
 */
import { useEffect, useMemo, useState } from "react";
import type { ServiceCategory } from "@prisma/client";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { FilterChips } from "./filter-chips";
import { PortfolioThumb } from "./portfolio-thumb";
import type { PortfolioPhoto, PortfolioCategory } from "./types";

const PAGE_SIZE = 24;

type Props = {
  photos: PortfolioPhoto[];
  categories: PortfolioCategory[];
};

export function PortfolioGallery({ photos, categories }: Props) {
  const [active, setActive] = useState<ServiceCategory | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      active === "all" ? photos : photos.filter((p) => p.category === active),
    [photos, active],
  );
  const shown = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  // Reset pagination + lightbox au changement de filtre
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset volontaire au changement de filtre
    setVisibleCount(PAGE_SIZE);
    setLightboxIdx(null);
  }, [active]);

  return (
    <>
      <FilterChips categories={categories} active={active} onChange={setActive} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {shown.map((p, idx) => (
          <PortfolioThumb
            key={p.id}
            photo={p}
            index={idx}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            onOpen={setLightboxIdx}
            eager={idx < 4}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mt-12"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune photo dans cette catégorie pour le moment.
        </p>
      )}

      {hasMore && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[var(--color-violet-200)] text-sm text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Voir plus
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
        </div>
      )}

      {lightboxIdx !== null && filtered[lightboxIdx] && (
        <PhotoLightbox
          photos={filtered}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
