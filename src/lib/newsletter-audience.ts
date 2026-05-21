/**
 * Helpers de calcul d'audience pour les campagnes newsletter.
 *
 * Une "audience" = ensemble des abonnées qui recevront une campagne, calculé
 * au moment de l'envoi à partir des filtres saisis dans le form admin.
 *
 * Règles toujours appliquées (non négociables) :
 *  - confirmedAt != null (double opt-in CNIL validé)
 *  - unsubscribedAt == null (pas désabonnée)
 *  - PlatformSettings.newsletterEnabled = true (feature flag global)
 *
 * Filtres optionnels :
 *  - sources : ne garder que les abonnées issues de sources données
 *    (ex: ["footer", "blog-cta"])
 *  - createdAfter / createdBefore : restreindre à une fenêtre temporelle
 *    d'inscription (utile pour cibler les "nouvelles inscrites")
 *
 * Future Phase 2 : tags, taux d'engagement, scoring…
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AudienceFilters = {
  sources?: string[]; // ex: ["footer", "blog-cta"]
  createdAfter?: string | null; // ISO date
  createdBefore?: string | null; // ISO date
};

/** Sources connues actuellement loguées en DB. À étendre quand on en ajoute. */
export const KNOWN_SOURCES = [
  "footer",
  "blog-cta",
  "ebook-thankyou",
  "reservation",
  "admin",
] as const;

export function buildAudienceWhere(
  filters: AudienceFilters | null | undefined,
): Prisma.NewsletterSubscriberWhereInput {
  const where: Prisma.NewsletterSubscriberWhereInput = {
    confirmedAt: { not: null },
    unsubscribedAt: null,
  };

  if (filters?.sources && filters.sources.length > 0) {
    where.source = { in: filters.sources };
  }

  if (filters?.createdAfter || filters?.createdBefore) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.createdAfter) {
      const d = new Date(filters.createdAfter);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (filters.createdBefore) {
      const d = new Date(filters.createdBefore);
      if (!Number.isNaN(d.getTime())) range.lte = d;
    }
    if (Object.keys(range).length > 0) where.createdAt = range;
  }

  return where;
}

/** Compte le nombre d'abonnées qui matchent les filtres (preview UI). */
export async function countAudience(
  filters: AudienceFilters | null | undefined,
): Promise<number> {
  return prisma.newsletterSubscriber.count({
    where: buildAudienceWhere(filters),
  });
}

/**
 * Récupère les abonnées d'une audience. Renvoie les champs nécessaires à
 * l'envoi (id, email, name, unsubscribeToken).
 */
export async function loadAudience(
  filters: AudienceFilters | null | undefined,
): Promise<
  Array<{
    id: string;
    email: string;
    name: string | null;
    unsubscribeToken: string;
  }>
> {
  return prisma.newsletterSubscriber.findMany({
    where: buildAudienceWhere(filters),
    select: {
      id: true,
      email: true,
      name: true,
      unsubscribeToken: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Valide et nettoie les filtres saisis dans le form admin. */
export function sanitizeAudienceFilters(
  raw: AudienceFilters | null | undefined,
): AudienceFilters {
  const out: AudienceFilters = {};
  if (raw?.sources && Array.isArray(raw.sources)) {
    const valid = raw.sources.filter(
      (s) => typeof s === "string" && s.length > 0 && s.length < 60,
    );
    if (valid.length > 0) out.sources = valid;
  }
  if (raw?.createdAfter && typeof raw.createdAfter === "string") {
    const d = new Date(raw.createdAfter);
    if (!Number.isNaN(d.getTime())) out.createdAfter = d.toISOString();
  }
  if (raw?.createdBefore && typeof raw.createdBefore === "string") {
    const d = new Date(raw.createdBefore);
    if (!Number.isNaN(d.getTime())) out.createdBefore = d.toISOString();
  }
  return out;
}
