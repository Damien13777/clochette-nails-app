import type { Metadata } from "next";
import { Suspense } from "react";
import { Cinzel, Julius_Sans_One, Inria_Serif, Manrope } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "@/components/cookie-consent/cookie-banner";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";

/* ────────────────────────────────────────────────────────────
 * Fonts du Design System v1.1
 *
 * - Cinzel        → --font-serif : titres en capitales (h1-h4)
 * - Julius Sans One → --font-display : eyebrows, badges, boutons, labels
 * - Inria Serif (light + italic) → --font-sans : body éditorial + fallback italique des titres
 * - Manrope       → --font-ui : UI dense (inputs, helper, admin, tables, toasts)
 *
 * Subsetting optimisé : seul Inria Serif italique léger est chargé
 * (utilisé uniquement pour les <em> dans les titres Cinzel).
 * ──────────────────────────────────────────────────────────── */

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const julius = Julius_Sans_One({
  variable: "--font-julius",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const inria = Inria_Serif({
  variable: "--font-inria",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Clochette Nails · Prothésiste ongulaire à Moncoutant-sur-Sèvre",
    template: "%s · Clochette Nails",
  },
  description:
    "Studio de prothésie ongulaire à Moncoutant-sur-Sèvre. Manucure russe, pose semi-permanente et nail-art en cabine privée. Sur rendez-vous.",
  authors: [{ name: "Chloé Girard" }],
  creator: "Clochette Nails",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  formatDetection: { telephone: true, address: true, email: true },
  // Vérification Google Search Console — pose un <meta name="google-site-verification" ...>
  // Token à fournir via env (depuis https://search.google.com/search-console)
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const gaTrackingId = process.env.NEXT_PUBLIC_GA_TRACKING_ID;
  return (
    <html
      lang="fr"
      className={`${cinzel.variable} ${julius.variable} ${inria.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <CookieBanner />
        {gaTrackingId && (
          <Suspense fallback={null}>
            <GoogleAnalytics trackingId={gaTrackingId} />
          </Suspense>
        )}
      </body>
    </html>
  );
}
