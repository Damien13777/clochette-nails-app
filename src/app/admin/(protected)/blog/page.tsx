/**
 * /admin/blog — Liste des articles de blog.
 *
 * Filtres : ?status=all|draft|published|archived (défaut all).
 * Tri : publishedAt DESC pour PUBLISHED, sinon updatedAt DESC.
 */

import type { Metadata } from "next";
import type { ContentStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog-categories";

export const metadata: Metadata = {
  title: "Blog · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_META: Record<
  ContentStatus,
  { label: string; cls: string; dotCls: string }
> = {
  DRAFT: {
    label: "Brouillon",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
  PUBLISHED: {
    label: "Publié",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
    dotCls: "bg-[var(--color-success)]",
  },
  ARCHIVED: {
    label: "Archivé",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
    dotCls: "bg-[var(--color-warning)]",
  },
};

type FilterKey = "all" | "draft" | "published" | "archived";
const FILTERS: { key: FilterKey; label: string; status?: ContentStatus }[] = [
  { key: "all", label: "Tous" },
  { key: "draft", label: "Brouillons", status: "DRAFT" },
  { key: "published", label: "Publiés", status: "PUBLISHED" },
  { key: "archived", label: "Archivés", status: "ARCHIVED" },
];

type SearchParams = { status?: FilterKey };

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.status) ?? FILTERS[0];

  const where: Prisma.BlogPostWhereInput = filter.status
    ? { status: filter.status }
    : {};

  const [posts, counts] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy:
        filter.status === "PUBLISHED"
          ? [{ publishedAt: "desc" }]
          : [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        excerpt: true,
        coverImage: true,
        category: true,
        tags: true,
        publishedAt: true,
        updatedAt: true,
        readingTime: true,
      },
    }),
    fetchCounts(),
  ]);

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Contenu
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Blog
          </h1>
        </div>
        <Link
          href="/admin/blog/new"
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nouvel article
        </Link>
      </header>

      <nav
        role="tablist"
        aria-label="Filtrer par statut"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={
              f.key === "all" ? "/admin/blog" : `/admin/blog?status=${f.key}`
            }
            role="tab"
            aria-selected={filter.key === f.key}
            className={`inline-flex items-center gap-2 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
              filter.key === f.key
                ? "bg-[var(--color-violet-600)] text-white"
                : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {f.label}
            <span
              className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] ${
                filter.key === f.key
                  ? "bg-white/25 text-white"
                  : "bg-[var(--color-bone)] text-[var(--color-ink-700)]"
              }`}
            >
              {counts[f.key]}
            </span>
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucun article dans ce filtre.
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {posts.map((p) => {
            const status = STATUS_META[p.status];
            return (
              <li key={p.id}>
                <Link
                  href={`/admin/blog/${p.id}`}
                  className="grid grid-cols-[64px_1fr_auto] gap-4 items-start p-4 hover:bg-[var(--color-bone)] transition-colors"
                >
                  <div className="w-16 h-16 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-bone)] border border-[var(--color-line)] shrink-0">
                    {p.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.coverImage}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-[var(--color-ink-300)] text-xs">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-base leading-tight text-[var(--color-ink-900)] truncate"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {p.title}
                    </p>
                    <p
                      className="text-xs text-[var(--color-ink-500)] mt-1 line-clamp-2"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {p.excerpt}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span
                        className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-ink-900)] bg-[var(--color-bone)] border border-[var(--color-line)] px-2 py-0.5 rounded-full"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {BLOG_CATEGORY_LABELS[p.category]}
                      </span>
                      {p.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-violet-700)] bg-[var(--color-violet-50)] px-2 py-0.5 rounded-full"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {p.status === "PUBLISHED" &&
                    p.publishedAt &&
                    p.publishedAt.getTime() > Date.now() ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] whitespace-nowrap bg-[var(--color-violet-50)] text-[var(--color-violet-700)]"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-violet-600)]" />
                        Programmé
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${status.cls}`}
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dotCls}`} />
                        {status.label}
                      </span>
                    )}
                    <span
                      className="text-[10px] text-[var(--color-ink-500)] whitespace-nowrap"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {p.readingTime ?? "?"} min de lecture
                    </span>
                    {p.publishedAt && (
                      <span
                        className="text-[10px] text-[var(--color-ink-500)] whitespace-nowrap"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {p.publishedAt.toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function fetchCounts(): Promise<Record<FilterKey, number>> {
  const [all, draft, published, archived] = await Promise.all([
    prisma.blogPost.count(),
    prisma.blogPost.count({ where: { status: "DRAFT" } }),
    prisma.blogPost.count({ where: { status: "PUBLISHED" } }),
    prisma.blogPost.count({ where: { status: "ARCHIVED" } }),
  ]);
  return { all, draft, published, archived };
}
