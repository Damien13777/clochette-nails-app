/**
 * Catégories Blog — liste fermée utilisée pour le tri public sur /blog.
 *
 * Une seule catégorie par article (champ obligatoire). Les tags restent
 * pour le SEO et les articles connexes mais ne sont pas exposés en
 * filtre côté cliente.
 */

import { BlogCategory } from "@prisma/client";

export const BLOG_CATEGORY_VALUES = [
  BlogCategory.CONSEILS,
  BlogCategory.TENDANCES,
  BlogCategory.TUTORIELS,
  BlogCategory.COULISSES,
] as const;

export const BLOG_CATEGORY_LABELS: Record<BlogCategory, string> = {
  CONSEILS: "Conseils & entretien",
  TENDANCES: "Tendances & inspirations",
  TUTORIELS: "Tutoriels & techniques",
  COULISSES: "Coulisses du salon",
};

/** Slug URL court pour ?cat=… (préférable à l'enum brut en minuscules). */
export const BLOG_CATEGORY_SLUGS: Record<BlogCategory, string> = {
  CONSEILS: "conseils",
  TENDANCES: "tendances",
  TUTORIELS: "tutoriels",
  COULISSES: "coulisses",
};

/** Inverse de BLOG_CATEGORY_SLUGS pour parser ?cat=… */
export function categoryFromSlug(slug: string): BlogCategory | null {
  const entry = (Object.entries(BLOG_CATEGORY_SLUGS) as [BlogCategory, string][])
    .find(([, s]) => s === slug);
  return entry ? entry[0] : null;
}

export function isBlogCategory(v: unknown): v is BlogCategory {
  return (
    typeof v === "string" &&
    (BLOG_CATEGORY_VALUES as readonly string[]).includes(v)
  );
}
