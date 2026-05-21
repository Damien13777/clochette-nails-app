/**
 * Sources d'inscription newsletter — constantes client-safe.
 *
 * Ce fichier ne dépend de RIEN côté serveur (pas de Prisma, pas d'auth),
 * il peut être importé librement dans un composant client.
 *
 * Réutilisé par `lib/newsletter-audience.ts` (côté serveur).
 */

export const KNOWN_SOURCES = [
  "footer",
  "blog-cta",
  "ebook-thankyou",
  "reservation",
  "admin",
] as const;

export type NewsletterSource = (typeof KNOWN_SOURCES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  footer: "Footer du site",
  "blog-cta": "CTA Blog",
  "ebook-thankyou": "Après achat ebook",
  reservation: "Page réservation",
  admin: "Ajoutée manuellement",
};
