/**
 * Next.js 16 — Proxy (ex-middleware).
 *
 * En Next 16, le runtime du proxy est **Node.js** (imposé, non configurable) :
 * on peut donc lire Prisma directement ici.
 *
 * Deux responsabilités :
 *  1. Protection /admin via le callback `authorized` (auth.config.ts). S'il
 *     refuse, la requête est redirigée EN AMONT et la fonction ci-dessous ne
 *     s'exécute pas.
 *  2. Mode maintenance : sur les routes PUBLIQUES, si `maintenanceMode` est
 *     actif, on renvoie un vrai HTTP 503 (Service Unavailable) + `Retry-After`
 *     + `X-Robots-Tag: noindex` avec une page autoportante. Bonne pratique SEO :
 *     Google comprend une indisponibilité temporaire et ne désindexe pas.
 *     L'espace /admin et les assets statiques (logo de la page, robots.txt,
 *     sitemap.xml…) restent servis pour pouvoir désactiver le mode.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { renderMaintenancePage } from "@/lib/maintenance-page";

export const { auth } = NextAuth(authConfig);

/**
 * Cache mémoire court : évite une requête DB à chaque page publique. Le proxy
 * tourne dans un process Node persistant (sous `next start`) → l'état module
 * survit entre les requêtes. Toggle admin reflété en ≤ 10 s.
 */
const MAINTENANCE_TTL_MS = 10_000;
let maintenanceCache: { expires: number; mode: boolean; message: string | null } | null = null;

async function readMaintenance(): Promise<{ mode: boolean; message: string | null }> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expires > now) {
    return maintenanceCache;
  }
  let mode = false;
  let message: string | null = null;
  try {
    const settings = await prisma.platformSettings.findFirst({
      select: { maintenanceMode: true, maintenanceMessage: true },
    });
    mode = settings?.maintenanceMode ?? false;
    message = settings?.maintenanceMessage ?? null;
  } catch {
    // Fail-open : en cas d'erreur DB, on ne bloque PAS le site.
    mode = false;
  }
  maintenanceCache = { expires: now + MAINTENANCE_TTL_MS, mode, message };
  return { mode, message };
}

/**
 * Assets servis même en maintenance : logo de la page, polices, css/js,
 * robots.txt, sitemap.xml, manifest… (pour que les crawlers lisent robots et
 * que la page de maintenance affiche son logo).
 */
const PASSTHROUGH_ASSET =
  /\.(?:svg|png|jpe?g|webp|gif|ico|css|m?js|woff2?|ttf|otf|map|xml|txt|webmanifest)$/i;

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  // L'admin reste toujours accessible (pour (dés)activer la maintenance) ;
  // les assets statiques passent toujours.
  if (pathname.startsWith("/admin") || PASSTHROUGH_ASSET.test(pathname)) {
    return NextResponse.next();
  }

  const { mode, message } = await readMaintenance();
  if (mode) {
    return new NextResponse(renderMaintenancePage(message), {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "3600",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  }

  return NextResponse.next();
});

export const config = {
  /**
   * Matche toutes les routes sauf :
   *  - /api/* (les API routes gèrent leur propre auth via requireAdmin/auth())
   *  - assets Next.js et favicon
   *  - /uploads/* (servis statiquement par Nginx en prod, par Next en dev)
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|uploads/).*)"],
};
