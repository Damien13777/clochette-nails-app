"use client";

/**
 * Grille des photos jointes par la cliente sur une fiche RDV.
 *
 * Au clic, la photo s'ouvre dans la PhotoLightbox partagée (comme le
 * portfolio /realisations) au lieu d'un nouvel onglet. Les uploads clientes
 * n'ont pas de variants → la lightbox retombe sur l'original full size.
 * Pas de légende (nom de fichier inutile).
 */

import { useState } from "react";
import { PhotoLightbox, type LightboxPhoto } from "@/components/photo-lightbox";

type BookingPhotoFile = { id: string; url: string };

export function BookingPhotos({ files }: { files: BookingPhotoFile[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const photos: LightboxPhoto[] = files.map((f, i) => ({
    id: f.id,
    url: f.url,
    alt: `Photo jointe ${i + 1}`,
  }));

  return (
    <>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {files.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Agrandir la photo ${i + 1}`}
              className="group block w-full"
            >
              <div className="relative aspect-square rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-bone)] border border-[var(--color-line)] cursor-pointer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={`Photo jointe ${i + 1}`}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            </button>
          </li>
        ))}
      </ul>

      {openIndex !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
