"use client";

/**
 * Vignette portfolio partagée : bouton ratio 4:5 (coins arrondis), image
 * lazy + srcSet, légende au survol. Clic → onOpen(index) (ouvre la lightbox).
 * `sizes` passé en prop (teaser et page ont des largeurs différentes).
 */
import { buildSrcSet } from "@/lib/image-srcset";
import type { PortfolioPhoto } from "./types";

type Props = {
  photo: PortfolioPhoto;
  index: number;
  sizes: string;
  onOpen: (index: number) => void;
};

export function PortfolioThumb({ photo, index, sizes, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Voir ${photo.alt} en plein écran`}
      className="group relative aspect-[4/5] w-full rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)] focus:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        srcSet={buildSrcSet(photo.variants)}
        sizes={sizes}
        alt={photo.alt}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {photo.caption && (
        <span
          className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-700)] bg-[var(--color-paper)]/85 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {photo.caption}
        </span>
      )}
    </button>
  );
}
