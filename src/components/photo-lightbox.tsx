"use client";

/**
 * PhotoLightbox — modale plein écran avec navigation prev/next.
 * Partagée par toutes les galeries (portfolio landing + détail prestation).
 *
 * Charge la variante `large` (1600w) pour qualité max, fallback sur url
 * principale. Clavier : ESC pour fermer, ←/→ pour naviguer.
 * Body scroll bloqué pendant l'ouverture.
 */

import { useCallback, useEffect, useState } from "react";
import { getVariantUrl } from "@/lib/image-srcset";

export type LightboxPhoto = {
  id: string;
  url: string;
  alt: string;
  caption?: string | null;
  variants?: unknown;
};

type Props = {
  photos: LightboxPhoto[];
  startIndex: number;
  onClose: () => void;
};

export function PhotoLightbox({ photos, startIndex, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const photo = photos[idx];
  const hasPrev = idx > 0;
  const hasNext = idx < photos.length - 1;

  const goPrev = useCallback(() => {
    if (idx > 0) setIdx(idx - 1);
  }, [idx]);
  const goNext = useCallback(() => {
    if (idx < photos.length - 1) setIdx(idx + 1);
  }, [idx, photos.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!photo) return null;
  const fullUrl = getVariantUrl(photo.variants, "large") ?? photo.url;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm grid place-items-center p-4 md:p-8"
    >
      <div
        className="relative max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fullUrl}
          alt={photo.alt}
          className="block max-w-[92vw] max-h-[80vh] md:max-h-[88vh] w-auto h-auto object-contain rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)]"
        />
        {photo.caption && (
          <p
            className="mt-3 text-center text-sm text-white/90 px-4"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {photo.caption}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 md:top-6 md:right-6 w-11 h-11 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-md transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>

      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="Photo précédente"
          className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-md transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="Photo suivante"
          className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-md transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {photos.length > 1 && (
        <p
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.18em] text-white/70"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {idx + 1} / {photos.length}
        </p>
      )}
    </div>
  );
}
