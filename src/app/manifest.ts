/**
 * Web App Manifest (PWA) — généré dynamiquement par Next.js (App Router).
 *
 * Active "Ajouter à l'écran d'accueil" sur mobile (Safari iOS / Chrome
 * Android) — le site se comporte alors comme une app installée.
 *
 * Icônes (toutes générées par `scripts/generate-brand-assets.ts`) :
 *  - `public/icon-192.png` / `icon-512.png` — PWA "any" (écran d'accueil + splash)
 *  - `public/icon-512-maskable.png` — adaptive icon Android (logo dans la safe-zone)
 *  - `src/app/apple-icon.png` (180) — iOS Safari (convention Next metadata)
 *  - `src/app/favicon.ico` (16/32/48) — onglet navigateur
 * Toutes en plein cadre sur fond crème (pas de transparence → pas de coins noirs
 * iOS). Theming via `PlatformSettings` à exposer plus tard (produit duplicable).
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
