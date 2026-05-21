"use client";

/**
 * PrestationGallery — grille de photos avec lightbox au clic.
 * Utilisée sur la page détail d'une prestation pour la section "En images".
 *
 * Les photos sont chargées en variantes srcset (économise mobile),
 * et la `large` variant est chargée à l'ouverture de la lightbox.
 */

import { useState } from "react";
import { buildSrcSet } from "@/lib/image-srcset";
import { PhotoLightbox, type LightboxPhoto } from "./photo-lightbox";

type Props = {
  photos: LightboxPhoto[];
};

export function PrestationGallery({ photos }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {photos.map((p, idx) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenIdx(idx)}
            aria-label={`Voir ${p.alt} en plein écran`}
            className="group relative aspect-square rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)] focus:ring-offset-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              srcSet={buildSrcSet(p.variants)}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              alt={p.alt}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
          </button>
        ))}
      </div>

      {openIdx !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={openIdx}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </>
  );
}
