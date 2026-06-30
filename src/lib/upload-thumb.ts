/**
 * Vignettes des images uploadées (covers blog / ebooks).
 *
 * Pas d'optimiseur runtime sur /uploads (cf. reference next/image) : on
 * pré-génère donc une variante « thumb » à l'upload, à côté de la cover pleine
 * taille. Les pages LISTE servent la thumb (vignettes ~320px), les pages DÉTAIL
 * gardent la pleine taille. Convention de nommage : `{nom}.webp` → `{nom}-thumb.webp`.
 *
 * Ce module est PUR (zéro dépendance serveur) → importable côté composants ET
 * côté helpers d'upload (qui font la génération Sharp).
 */

/** Largeur de la vignette (couvre l'affichage liste ~320px en densité 2×). */
export const THUMB_WIDTH = 640;
export const THUMB_WEBP_QUALITY = 80;

/**
 * Déduit l'URL de la vignette depuis l'URL de la cover pleine taille.
 * `/uploads/blog/abc.webp` → `/uploads/blog/abc-thumb.webp`.
 * Renvoie l'URL inchangée si pas d'extension reconnue (fallback sûr).
 */
export function thumbUrl(url: string): string {
  return url.replace(/(\.[a-z0-9]+)$/i, "-thumb$1");
}
