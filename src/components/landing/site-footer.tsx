/**
 * SiteFooter — Server Component : lit les réseaux sociaux en DB
 * (PlatformSettings) et délègue le rendu à <FooterContent>.
 *
 * Le rendu vit dans `footer-content.tsx` (sans Prisma) pour pouvoir être
 * réutilisé par des Client Components (error boundary) sans bundler `pg`.
 */

import { prisma } from "@/lib/prisma";
import { FooterContent, type FooterSocial } from "./footer-content";

export async function SiteFooter() {
  const settings = await prisma.platformSettings.findFirst({
    select: {
      instagramUrl: true,
      facebookUrl: true,
      tiktokUrl: true,
      pinterestUrl: true,
    },
  });
  const socials: FooterSocial[] = (
    [
      { key: "instagram", label: "Instagram", url: settings?.instagramUrl },
      { key: "facebook", label: "Facebook", url: settings?.facebookUrl },
      { key: "tiktok", label: "TikTok", url: settings?.tiktokUrl },
      { key: "pinterest", label: "Pinterest", url: settings?.pinterestUrl },
    ] as const
  )
    .filter((s) => Boolean(s.url?.trim()))
    .map((s) => ({ key: s.key, label: s.label, url: s.url!.trim() }));

  return <FooterContent socials={socials} />;
}
