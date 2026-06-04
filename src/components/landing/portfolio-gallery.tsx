"use client";

/**
 * Galerie portfolio interactive (filter chips + grid + lightbox).
 * Consomme les photos servies par le RSC parent.
 *
 * Click sur une photo → ouvre une lightbox plein écran qui charge la
 * variante `large` (1600w) pour qualité maximale. ESC + click outside
 * + bouton X pour fermer. Navigation flèches gauche/droite entre photos
 * (clavier + boutons).
 */

import { useEffect, useMemo, useState } from "react";
import type { ServiceCategory } from "@prisma/client";
import { buildSrcSet } from "@/lib/image-srcset";
import { PhotoLightbox } from "@/components/photo-lightbox";

export type PortfolioGalleryPhoto = {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  category: ServiceCategory;
  variants: unknown;
};

type Category = { id: ServiceCategory; label: string };

type Props = {
  photos: PortfolioGalleryPhoto[];
  categories: Category[];
};

export function PortfolioGallery({ photos, categories }: Props) {
  const [active, setActive] = useState<ServiceCategory | "all">("all");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const visible = useMemo(
    () =>
      active === "all" ? photos : photos.filter((p) => p.category === active),
    [photos, active],
  );

  // Reset lightbox si on change de filtre pendant qu'elle est ouverte
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset volontaire de la lightbox au changement de filtre
    setLightboxIdx(null);
  }, [active]);

  function openLightbox(idx: number) {
    setLightboxIdx(idx);
  }

  return (
    <>
      {/* Filter chips */}
      <div
        role="tablist"
        aria-label="Filtres portfolio"
        className="flex gap-2 mb-10 overflow-x-auto md:justify-center pb-2 -mx-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <FilterChip
          label="Tous"
          active={active === "all"}
          onClick={() => setActive("all")}
        />
        {categories.map((cat) => (
          <FilterChip
            key={cat.id}
            label={cat.label}
            active={active === cat.id}
            onClick={() => setActive(cat.id)}
          />
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {visible.map((p, idx) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openLightbox(idx)}
            aria-label={`Voir ${p.alt} en plein écran`}
            className="group relative aspect-square rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)] focus:ring-offset-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              srcSet={buildSrcSet(p.variants)}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              alt={p.alt}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {p.caption && (
              <span
                className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-700)] bg-[var(--color-paper)]/85 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {p.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mt-12"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune photo dans cette catégorie pour le moment.
        </p>
      )}

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

// ─────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 px-4 py-2 text-xs uppercase tracking-[0.06em] rounded-full transition-all ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] hover:text-[var(--color-violet-700)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </button>
  );
}
