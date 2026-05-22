/**
 * Web App Manifest (PWA) — généré dynamiquement par Next.js (App Router).
 *
 * Active "Ajouter à l'écran d'accueil" sur mobile (Safari iOS / Chrome
 * Android) — le site se comporte alors comme une app installée.
 *
 * Pour activer pleinement l'install PWA il faut **ajouter 2 PNG carrés**
 * dans `/public/` :
 *  - `icon-192.png` (192×192) — affiché sur l'écran d'accueil
 *  - `icon-512.png` (512×512) — splash screen + Play Store si conversion APK
 * Idéalement aussi `apple-touch-icon.png` (180×180) — iOS Safari.
 *
 * En attendant, le fallback `favicon.ico` permet au manifest d'être valide
 * mais Chrome ne proposera pas l'install tant que les vrais PNG ne sont pas
 * là (warning Lighthouse "Manifest doesn't have icon at least 144px").
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clochette Nails",
    short_name: "Clochette",
    description:
      "Studio de prothésie ongulaire à Moncoutant-sur-Sèvre. Sur rendez-vous.",
    start_url: "/",
    display: "standalone",
    background_color: "#FCFBF7", // cream
    theme_color: "#5E4392", // violet-700
    lang: "fr-FR",
    icons: [
      // Fallback universel : favicon.ico existant
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      // À fournir pour activer l'install PWA :
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["beauty", "lifestyle", "business"],
  };
}
