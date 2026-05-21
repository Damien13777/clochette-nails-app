/**
 * Admin layout — wrapper minimal pour TOUT /admin/*.
 *
 * Ce layout s'applique aux deux route groups :
 *  - (auth)/connexion  → login + autres pages publiques admin
 *  - (protected)/*     → toutes les pages protégées (dashboard, calendrier, etc.)
 *
 * Le wrapping AdminShell (sidebar + topbar) + l'auth check sont dans
 * (protected)/layout.tsx — pas ici.
 *
 * La classe `admin-shell` bascule la typo vers Manrope partout dans /admin
 * (cf. globals.css @layer components).
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Administration",
    template: "%s · Administration · Clochette Nails",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-shell min-h-screen bg-[var(--color-cream)]">
      {children}
    </div>
  );
}
