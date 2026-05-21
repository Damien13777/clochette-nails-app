/**
 * Helper pour construire l'attribut srcset depuis le JSON `variants` stocké
 * en DB sur SiteMedia / ServicePhoto.
 *
 * Format attendu en DB (généré par image-processor.ts → Sharp) :
 *   {
 *     thumb:  { key: "...", url: "/uploads/..." },  // max 400px
 *     medium: { key: "...", url: "/uploads/..." },  // max 800px
 *     large:  { key: "...", url: "/uploads/..." },  // max 1600px
 *   }
 *
 * Le browser pioche la variante optimale selon `sizes` + le DPR du device.
 * Gain typique : ~50-70% de bytes économisés sur mobile vs. servir le `large`.
 *
 * Le srcset n'est généré que si au moins 2 variantes sont présentes (sinon
 * le browser n'a rien à choisir, autant retourner undefined).
 */

const VARIANT_WIDTHS = {
  thumb: 400,
  medium: 800,
  large: 1600,
} as const;

type VariantsJson = {
  thumb?: { url?: string };
  medium?: { url?: string };
  large?: { url?: string };
};

/**
 * @param variants - le JSON brut depuis la DB (typé `unknown` côté Prisma)
 * @returns un srcset prêt à coller dans l'attribut HTML, ou undefined si insuffisant
 */
export function buildSrcSet(variants: unknown): string | undefined {
  if (!variants || typeof variants !== "object") return undefined;
  const v = variants as VariantsJson;
  const parts: string[] = [];
  for (const [key, width] of Object.entries(VARIANT_WIDTHS)) {
    const variant = v[key as keyof VariantsJson];
    if (variant?.url) {
      parts.push(`${variant.url} ${width}w`);
    }
  }
  return parts.length >= 2 ? parts.join(", ") : undefined;
}

/**
 * Récupère l'URL d'une variante spécifique (thumb / medium / large).
 * Retourne null si la variante n'existe pas.
 */
export function getVariantUrl(
  variants: unknown,
  variant: "thumb" | "medium" | "large",
): string | null {
  if (!variants || typeof variants !== "object") return null;
  const v = variants as VariantsJson;
  return v[variant]?.url ?? null;
}
