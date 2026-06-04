/**
 * /blog/[slug] — Détail public d'un article.
 *
 * SEO complet :
 *  - Metadata dynamique (title, description, OG, Twitter Card)
 *  - Canonical
 *  - JSON-LD BlogPosting
 *  - HTML sémantique <article> <time> <h1>
 *
 * Le contenu HTML produit par TipTap est sanitizé via DOMPurify avant
 * d'être injecté via dangerouslySetInnerHTML.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { breadcrumbJsonLd } from "@/lib/seo-jsonld";
import {
  BLOG_CATEGORY_LABELS,
  BLOG_CATEGORY_SLUGS,
} from "@/lib/blog-categories";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({
    where: { slug },
    select: {
      title: true,
      metaTitle: true,
      metaDesc: true,
      excerpt: true,
      coverImage: true,
      publishedAt: true,
      updatedAt: true,
      status: true,
      tags: true,
    },
  });
  if (!post || post.status !== "PUBLISHED") {
    return { title: "Article introuvable", robots: { index: false } };
  }

  const title = post.metaTitle ?? post.title;
  const description = post.metaDesc ?? post.excerpt;
  const ogImage = post.coverImage ? `${SITE_URL}${post.coverImage}` : undefined;

  return {
    title: { absolute: `${title} — Clochette Nails` },
    description,
    alternates: { canonical: `/blog/${slug}` },
    keywords: post.tags.length > 0 ? post.tags : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url: `${SITE_URL}/blog/${slug}`,
      images: ogImage ? [{ url: ogImage }] : undefined,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({
    where: { slug },
  });
  if (!post || post.status !== "PUBLISHED") notFound();
  if (post.publishedAt && post.publishedAt > new Date()) notFound();

  const sanitizedHtml = sanitizeHtml(post.content);
  const pubDate = post.publishedAt;

  // Articles connexes : même tag, status PUBLISHED, exclu cet article
  const related =
    post.tags.length > 0
      ? await prisma.blogPost.findMany({
          where: {
            status: "PUBLISHED",
            publishedAt: { lte: new Date() },
            tags: { hasSome: post.tags },
            NOT: { id: post.id },
          },
          orderBy: { publishedAt: "desc" },
          take: 3,
          select: {
            id: true,
            slug: true,
            title: true,
            excerpt: true,
            coverImage: true,
            coverImageAlt: true,
            readingTime: true,
          },
        })
      : [];

  // JSON-LD BlogPosting
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDesc ?? post.excerpt,
    image: post.coverImage ? [`${SITE_URL}${post.coverImage}`] : undefined,
    datePublished: pubDate?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      "@type": "Organization",
      name: "Clochette Nails",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Clochette Nails",
      url: SITE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${slug}`,
    },
    articleSection: BLOG_CATEGORY_LABELS[post.category],
    keywords: post.tags.join(", "),
  };

  return (
    <>
      <SiteHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Accueil", path: "/" },
              { name: "Journal", path: "/blog" },
              { name: post.title, path: `/blog/${slug}` },
            ]),
          ),
        }}
      />

      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
        <article className="max-w-[760px] mx-auto px-5 lg:px-8">
          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] transition-colors mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Tous les articles
          </Link>

          {/* Header */}
          <header className="space-y-4 mb-10">
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/blog?cat=${BLOG_CATEGORY_SLUGS[post.category]}`}
                className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-violet-700)] bg-[var(--color-violet-50)] px-2 py-0.5 rounded-full hover:bg-[var(--color-violet-100)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {BLOG_CATEGORY_LABELS[post.category]}
              </Link>
            </div>
            <h1
              className="text-[clamp(2rem,4vw,3rem)] leading-tight text-[var(--color-ink-900)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {post.title}
            </h1>
            <div
              className="flex items-center gap-3 text-xs text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {pubDate && (
                <time dateTime={pubDate.toISOString()}>
                  {pubDate.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              )}
              {post.readingTime && (
                <>
                  <span aria-hidden>·</span>
                  <span>{post.readingTime} min de lecture</span>
                </>
              )}
            </div>
          </header>

          {/* Cover */}
          {post.coverImage && (
            <div className="rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-line)] bg-[var(--color-bone)] mb-10">
              <Image
                src={post.coverImage}
                alt={post.coverImageAlt ?? post.title}
                width={1280}
                height={720}
                priority
                className="w-full h-auto"
              />
            </div>
          )}

          {/* Content */}
          <div
            className="rich-content max-w-none text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-ui)" }}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />

          {/* CTA réservation */}
          <Reveal>
          <div className="mt-12 p-6 rounded-[var(--radius-md)] section-cta overflow-hidden border border-[var(--color-violet-100)] text-center">
            <p
              className="text-sm text-[var(--color-ink-700)] mb-3"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Envie de prendre soin de vos mains ?
            </p>
            <Link
              href="/reservation"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prendre RDV
            </Link>
          </div>
          </Reveal>
        </article>

        {/* Articles connexes */}
        {related.length > 0 && (
          <Reveal>
          <section className="max-w-[1200px] mx-auto px-5 lg:px-8 mt-20">
            <h2
              className="text-2xl mb-6 text-center"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              À lire aussi
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/blog/${r.slug}`}
                    className="group block bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden h-full transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
                  >
                    <div className="aspect-[16/10] bg-[var(--color-bone)] overflow-hidden">
                      {r.coverImage ? (
                        <Image
                          src={r.coverImage}
                          alt={r.coverImageAlt ?? r.title}
                          width={400}
                          height={250}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[var(--color-ink-300)] text-xs">
                          —
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <h3
                        className="text-base leading-tight line-clamp-2"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {r.title}
                      </h3>
                      <p
                        className="text-xs text-[var(--color-ink-500)] line-clamp-2"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {r.excerpt}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          </Reveal>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
