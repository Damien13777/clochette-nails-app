/**
 * Helpers JSON-LD (schema.org) partagés.
 *
 * `SITE_URL` est dérivé de NEXT_PUBLIC_SITE_URL (fallback prod). Les objets
 * retournés sont sérialisés par les pages dans un <script type="application/ld+json">.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

/** @id canonique du salon (défini en entier dans LocalBusinessJsonLd). */
export const BEAUTYSALON_ID = `${SITE_URL}/#beautysalon`;

/**
 * Construit un BreadcrumbList. `path` est relatif (ex: "/prestations/x").
 */
export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
