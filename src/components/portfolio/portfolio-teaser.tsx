"use client";

/**
 * Teaser portfolio de la landing : filtres + max 8 photos.
 * Mobile = slide 2 + aperçu (scroll-snap, même pattern que prestations) ;
 * desktop = grille 4 colonnes. Clic → lightbox. Lien « Voir tout le
 * portfolio » → /realisations.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ServiceCategory } from "@prisma/client";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { FilterChips } from "./filter-chips";
import { PortfolioThumb } from "./portfolio-thumb";
import type { PortfolioPhoto, PortfolioCategory } from "./types";

const MAX_TEASER = 8;

type Props = {
  photos: PortfolioPhoto[];
  categories: PortfolioCategory[];
};

export function PortfolioTeaser({ photos, categories }: Props) {
  const [active, setActive] = useState<ServiceCategory | "all">("all");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const visible = useMemo(() => {
    const filtered =
      active === "all" ? photos : photos.filter((p) => p.category === active);
    return filtered.slice(0, MAX_TEASER);
  }, [photos, active]);

  // Reset lightbox au changement de filtre
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset volontaire au changement de filtre
    setLightboxIdx(null);
  }, [active]);

  return (
    <>
      <FilterChips categories={categories} active={active} onChange={setActive} />

      {/* Mobile : slide 2 + aperçu (pattern prestations) ; desktop : grille 4 col */}
      <div className="flex md:grid md:grid-cols-4 gap-3 md:gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none scroll-px-5 -mx-5 px-5 md:mx-0 md:px-0 pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((p, idx) => (
          <div key={p.id} className="snap-start shrink-0 w-[42%] md:w-auto">
            <PortfolioThumb
              photo={p}
              index={idx}
              sizes="(min-width: 768px) 25vw, 42vw"
              onOpen={setLightboxIdx}
            />
          </div>
        ))}
      </div>

      {visible.length === 0 && (
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mt-8"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune photo dans cette catégorie pour le moment.
        </p>
      )}

      <div className="mt-10 text-center">
        <Link
          href="/realisations"
          className="text-sm text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] inline-flex items-center gap-1 transition-colors"
        >
          Voir tout le portfolio
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

      {lightboxIdx !== null && visible[lightboxIdx] && (
        <PhotoLightbox
          photos={visible}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
