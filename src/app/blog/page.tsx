/**
 * /blog — Liste publique des articles.
 *
 * Sélectionne uniquement les PUBLISHED dont publishedAt <= maintenant.
 * Pagination simple par 12.
 * Filtre par catégorie via ?cat=…
 *
 * Respecte le feature flag `blogEnabled` côté PlatformSettings.
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { thumbUrl } from "@/lib/upload-thumb";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import {
  BLOG_CATEGORY_LABELS,
  BLOG_CATEGORY_SLUGS,
  BLOG_CATEGORY_VALUES,
  categoryFromSlug,
} from "@/lib/blog-categories";

const PAGE_SIZE = 12;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Le journal — Clochette Nails",
  description:
    "Conseils manucure, inspirations saisonnières et coulisses du salon Clochette Nails à Moncoutant-sur-Sèvre.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: "Le journal — Clochette Nails",
    description:
      "Conseils manucure, inspirations saisonnières et coulisses du salon Clochette Nails.",
  },
};

type SearchParams = { page?: string; cat?: string };

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const settings = await prisma.platformSettings.findFirst({
    select: { blogEnabled: true },
  });
  if (settings && !settings.blogEnabled) {
    return <BlogDisabled />;
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const catSlug = (params.cat ?? "").trim().toLowerCase();
  const activeCategory = catSlug ? categoryFromSlug(catSlug) : null;

  const now = new Date();
  const where: Prisma.BlogPostWhereInput = {
    status: "PUBLISHED",
    publishedAt: { lte: now },
    ...(activeCategory ? { category: activeCategory } : {}),
  };

  // Compte d'articles par catégorie (pour afficher les badges).
  const categoryGroups = await prisma.blogPost.groupBy({
    by: ["category"],
    where: { status: "PUBLISHED", publishedAt: { lte: now } },
    _count: { _all: true },
  });
  const categoryCounts = new Map<string, number>();
  for (const g of categoryGroups) {
    categoryCounts.set(g.category, g._count._all);
  }

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        coverImageAlt: true,
        category: true,
        publishedAt: true,
        readingTime: true,
      },
    }),
    prisma.blogPost.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-8">
          {/* Hero */}
          <header className="text-center mb-12 max-w-2xl mx-auto">
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-violet-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Le journal
            </p>
            <h1
              className="mt-4 text-[clamp(2rem,4vw,3rem)] leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Inspirations &{" "}
              <em className="text-[var(--color-violet-700)]">conseils</em>
            </h1>
            <p
              className="mt-4 text-sm text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Pour prendre soin de vos mains au quotidien, suivre la saison et
              découvrir les coulisses du salon.
            </p>
          </header>

          {/* Category filter */}
          <nav
            aria-label="Filtrer par catégorie"
            className="flex flex-wrap justify-center gap-2 mb-10"
          >
            <Link
              href="/blog"
              className={`inline-flex items-center px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
                !activeCategory
                  ? "bg-[var(--color-violet-600)] text-white"
                  : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tous
            </Link>
            {BLOG_CATEGORY_VALUES.map((c) => {
              const count = categoryCounts.get(c) ?? 0;
              if (count === 0) return null;
              const isActive = activeCategory === c;
              return (
                <Link
                  key={c}
                  href={`/blog?cat=${BLOG_CATEGORY_SLUGS[c]}`}
                  className={`inline-flex items-center gap-1.5 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
                    isActive
                      ? "bg-[var(--color-violet-600)] text-white"
                      : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {BLOG_CATEGORY_LABELS[c]}
                  <span className="text-[10px] opacity-70">{count}</span>
                </Link>
              );
            })}
          </nav>

          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p
                className="text-sm text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {activeCategory
                  ? `Aucun article dans « ${BLOG_CATEGORY_LABELS[activeCategory]} » pour le moment.`
                  : "Aucun article publié pour le moment. Revenez bientôt !"}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="group block bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden h-full transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
                  >
                    <div className="aspect-[16/10] bg-[var(--color-bone)] overflow-hidden">
                      {p.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrl(p.coverImage)}
                          alt={p.coverImageAlt ?? p.title}
                          width={640}
                          height={400}
                          fetchPriority={i === 0 ? "high" : undefined}
                          loading={i === 0 ? "eager" : "lazy"}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[var(--color-ink-300)] text-xs uppercase tracking-[0.18em]">
                          Article
                        </div>
                      )}
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-violet-700)] bg-[var(--color-violet-50)] px-2 py-0.5 rounded-full"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {BLOG_CATEGORY_LABELS[p.category]}
                        </span>
                      </div>
                      <h2
                        className="text-lg leading-tight text-[var(--color-ink-900)]"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {p.title}
                      </h2>
                      <p
                        className="text-sm text-[var(--color-ink-500)] line-clamp-3"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {p.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-500)] pt-2 border-t border-[var(--color-line)]">
                        <time
                          dateTime={p.publishedAt?.toISOString()}
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {p.publishedAt?.toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </time>
                        {p.readingTime && (
                          <span style={{ fontFamily: "var(--font-ui)" }}>
                            {p.readingTime} min de lecture
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-center gap-3 mt-12"
            >
              {page > 1 && (
                <Link
                  href={`/blog?${new URLSearchParams({
                    ...(activeCategory
                      ? { cat: BLOG_CATEGORY_SLUGS[activeCategory] }
                      : {}),
                    page: String(page - 1),
                  })}`}
                  className="px-4 h-9 inline-flex items-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  ← Précédent
                </Link>
              )}
              <span
                className="text-xs text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Page {page} sur {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/blog?${new URLSearchParams({
                    ...(activeCategory
                      ? { cat: BLOG_CATEGORY_SLUGS[activeCategory] }
                      : {}),
                    page: String(page + 1),
                  })}`}
                  className="px-4 h-9 inline-flex items-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Suivant →
                </Link>
              )}
            </nav>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function BlogDisabled() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="text-center max-w-md">
        <h1
          className="text-3xl mb-4"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Le journal est en pause
        </h1>
        <p className="text-[var(--color-ink-500)]">
          Le blog est temporairement indisponible. Revenez bientôt !
        </p>
      </div>
    </main>
  );
}
