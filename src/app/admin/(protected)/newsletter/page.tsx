/**
 * Page /admin/newsletter — KPI + liste des abonnés.
 *
 * Filtres : ?filter=all|active|pending|unsubscribed (défaut: all)
 * Pagination : ?page=N (50/page)
 *
 * KPI cards en haut :
 *  - Actifs : confirmedAt non null + unsubscribedAt null
 *  - En attente : confirmedAt null + unsubscribedAt null (inscriptions non finalisées)
 *  - Inscrits 30j : confirmedAt >= now - 30 jours
 *  - Désabonnés : unsubscribedAt non null
 *  - Taux de confirmation : confirmedAt / (confirmedAt + en attente)
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SubscriberRow } from "./subscriber-row";
import { NewsletterTabs } from "./_tabs";

export const metadata: Metadata = {
  title: "Newsletter · Admin",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type FilterKey = "all" | "active" | "pending" | "unsubscribed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "active", label: "Actifs" },
  { key: "pending", label: "En attente" },
  { key: "unsubscribed", label: "Désabonnés" },
];

type SearchParams = {
  filter?: FilterKey;
  page?: string;
};

function isFilterKey(v: string | undefined): v is FilterKey {
  return v === "all" || v === "active" || v === "pending" || v === "unsubscribed";
}

function buildWhere(filter: FilterKey): Prisma.NewsletterSubscriberWhereInput {
  switch (filter) {
    case "active":
      return { confirmedAt: { not: null }, unsubscribedAt: null };
    case "pending":
      return { confirmedAt: null, unsubscribedAt: null };
    case "unsubscribed":
      return { unsubscribedAt: { not: null } };
    default:
      return {};
  }
}

function formatDateShort(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const filter: FilterKey = isFilterKey(params.filter) ? params.filter : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where = buildWhere(filter);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    subscribers,
    total,
    activeCount,
    pendingCount,
    unsubscribedCount,
    confirmed7d,
    confirmed30d,
  ] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: PAGE_SIZE,
      skip,
      select: {
        id: true,
        email: true,
        source: true,
        consentGivenAt: true,
        confirmedAt: true,
        unsubscribedAt: true,
        createdAt: true,
      },
    }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({
      where: { confirmedAt: { not: null }, unsubscribedAt: null },
    }),
    prisma.newsletterSubscriber.count({
      where: { confirmedAt: null, unsubscribedAt: null },
    }),
    prisma.newsletterSubscriber.count({
      where: { unsubscribedAt: { not: null } },
    }),
    prisma.newsletterSubscriber.count({
      where: { confirmedAt: { gte: sevenDaysAgo } },
    }),
    prisma.newsletterSubscriber.count({
      where: { confirmedAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const totalConfirmedOrPending = activeCount + pendingCount;
  const confirmRate =
    totalConfirmedOrPending > 0
      ? Math.round((activeCount / totalConfirmedOrPending) * 100)
      : 0;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10">
      <NewsletterTabs current="abonnes" />
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Communication
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Newsletter
        </h1>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard
          label="Abonnées actives"
          value={activeCount}
          tone="success"
        />
        <KpiCard
          label="En attente confirmation"
          value={pendingCount}
          tone="warning"
          hint="DOI non finalisé"
        />
        <KpiCard
          label="Inscrites 7 j"
          value={confirmed7d}
          tone="neutral"
        />
        <KpiCard
          label="Inscrites 30 j"
          value={confirmed30d}
          tone="neutral"
        />
        <KpiCard
          label="Taux de confirmation"
          value={`${confirmRate} %`}
          tone={confirmRate >= 70 ? "success" : confirmRate >= 40 ? "warning" : "danger"}
          hint={`Désabonnées : ${unsubscribedCount}`}
        />
      </div>

      {/* Filter chips */}
      <div
        role="tablist"
        aria-label="Filtrer les abonnées"
        className="flex flex-wrap gap-2 mb-6"
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            href={
              f.key === "all"
                ? "/admin/newsletter"
                : `/admin/newsletter?filter=${f.key}`
            }
          />
        ))}
      </div>

      {/* List */}
      {subscribers.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune abonnée dans ce filtre.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
          {/* Header desktop */}
          <div
            className="hidden md:grid grid-cols-[1fr_120px_140px_120px_140px] gap-4 px-5 py-3 border-b border-[var(--color-line)] bg-[var(--color-bone)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span>Email</span>
            <span>Source</span>
            <span>Saisie</span>
            <span>Statut</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-[var(--color-line)]">
            {subscribers.map((s) => (
              <SubscriberRow
                key={s.id}
                subscriber={{
                  id: s.id,
                  email: s.email,
                  source: s.source,
                  consentGivenAtFr: formatDateShort(s.consentGivenAt),
                  status: s.unsubscribedAt
                    ? "unsubscribed"
                    : s.confirmedAt
                      ? "active"
                      : "pending",
                  confirmedAtFr: s.confirmedAt
                    ? formatDateShort(s.confirmedAt)
                    : null,
                  unsubscribedAtFr: s.unsubscribedAt
                    ? formatDateShort(s.unsubscribedAt)
                    : null,
                }}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between mt-6"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <p className="text-xs text-[var(--color-ink-500)]">
            Page {page} sur {totalPages} · {total} abonnées
          </p>
          <div className="flex gap-2">
            <PaginationLink
              page={page - 1}
              filter={filter}
              disabled={page <= 1}
              label="← Précédent"
            />
            <PaginationLink
              page={page + 1}
              filter={filter}
              disabled={page >= totalPages}
              label="Suivant →"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

// ─── Sous-composants ────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone: "success" | "warning" | "danger" | "neutral";
  hint?: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    success: "text-[#1d6b48]",
    warning: "text-[#b3651e]",
    danger: "text-[var(--color-danger)]",
    neutral: "text-[var(--color-ink-900)]",
  };
  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-4">
      <p
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] leading-snug"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-medium ${toneClasses[tone]}`}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      {hint && (
        <p
          className="mt-1 text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <a
      href={href}
      role="tab"
      aria-selected={active}
      className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] border transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white border-[var(--color-violet-600)]"
          : "bg-[var(--color-paper)] text-[var(--color-ink-700)] border-[var(--color-line)] hover:bg-[var(--color-bone)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </a>
  );
}

function PaginationLink({
  page,
  filter,
  disabled,
  label,
}: {
  page: number;
  filter: FilterKey;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span
        className="px-3 py-1.5 rounded-full text-xs border border-[var(--color-line)] text-[var(--color-ink-300)] cursor-not-allowed"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </span>
    );
  }
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const href = params.toString()
    ? `/admin/newsletter?${params.toString()}`
    : "/admin/newsletter";
  return (
    <a
      href={href}
      className="px-3 py-1.5 rounded-full text-xs border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </a>
  );
}
