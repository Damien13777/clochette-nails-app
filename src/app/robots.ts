/**
 * robots.txt généré dynamiquement par Next.js (App Router).
 *
 * Stratégie :
 *  - Autorise la totalité du site public (Googlebot doit crawler)
 *  - Refuse l'admin, les routes API, et toutes les URLs qui contiennent des
 *    tokens cliente (annulation booking, désabonnement newsletter, téléchargement
 *    ebook signé, etc.) — sinon Googlebot suit les liens et les invalide
 *  - Référence le sitemap pour indexation accélérée
 */

import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/_next/",
          // Tokens cliente : ne JAMAIS être crawlés (Googlebot consommerait
          // le token single-use et invaliderait le lien pour la cliente)
          "/reservation/annuler",
          "/reservation/deplacer",
          "/newsletter/desinscrire",
          "/newsletter/confirmer",
          "/ebooks/telechargement",
          "/cartes-cadeau/succes",
          "/cartes-cadeau/echec",
          "/ebooks/succes",
          "/reservation/succes",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
