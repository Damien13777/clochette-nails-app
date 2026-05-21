/**
 * Sitemap dynamique généré par Next.js (App Router).
 *
 * Inclut : pages statiques + prestations PUBLISHED + articles blog PUBLISHED.
 * À l'avenir : ebooks, etc.
 */

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, priority: 1.0, changeFrequency: "weekly" },
    { url: `${SITE_URL}/prestations`, lastModified: now, priority: 0.9, changeFrequency: "monthly" },
    { url: `${SITE_URL}/reservation`, lastModified: now, priority: 0.9, changeFrequency: "weekly" },
    { url: `${SITE_URL}/cartes-cadeau`, lastModified: now, priority: 0.8, changeFrequency: "monthly" },
    { url: `${SITE_URL}/blog`, lastModified: now, priority: 0.7, changeFrequency: "weekly" },
    { url: `${SITE_URL}/ebooks`, lastModified: now, priority: 0.7, changeFrequency: "weekly" },
    { url: `${SITE_URL}/cgv`, lastModified: now, priority: 0.3, changeFrequency: "yearly" },
    { url: `${SITE_URL}/confidentialite`, lastModified: now, priority: 0.3, changeFrequency: "yearly" },
  ];

  // Prestations PUBLISHED
  const services = await prisma.service.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, updatedAt: true },
  });
  const servicePages: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${SITE_URL}/prestations/${s.slug}`,
    lastModified: s.updatedAt,
    priority: 0.8,
    changeFrequency: "monthly",
  }));

  // Articles blog PUBLISHED + publishedAt <= now
  const posts = await prisma.blogPost.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { lte: now },
    },
    select: { slug: true, publishedAt: true, updatedAt: true },
  });
  const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.updatedAt,
    priority: 0.6,
    changeFrequency: "monthly",
  }));

  // Ebooks PUBLISHED avec PDF
  const ebooks = await prisma.ebook.findMany({
    where: { status: "PUBLISHED", pdfUrl: { not: null } },
    select: { slug: true, updatedAt: true },
  });
  const ebookPages: MetadataRoute.Sitemap = ebooks.map((e) => ({
    url: `${SITE_URL}/ebooks/${e.slug}`,
    lastModified: e.updatedAt,
    priority: 0.7,
    changeFrequency: "monthly",
  }));

  return [...staticPages, ...servicePages, ...blogPages, ...ebookPages];
}
