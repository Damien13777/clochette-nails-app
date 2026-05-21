/**
 * /admin/prestations/options — liste des options supplémentaires.
 *
 * Filtres status (?status=all|draft|published|archived) + compteurs.
 * Tri par displayOrder ASC.
 */

import type { Metadata } from "next";
import type { ContentStatus, ServiceCategory } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CatalogToggle } from "../catalog-toggle";

export const metadata: Metadata = {
  title: "Options supplémentaires · Admin",
};

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  POSE_NATURELS: "Pose naturels",
  RALLONGEMENT: "Rallongement",
  PACK_SPECIAL: "Pack",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};

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
    label: "Publiée",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
    dotCls: "bg-[var(--color-success)]",
  },
  ARCHIVED: {
    label: "Archivée",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
    dotCls: "bg-[var(--color-warning)]",
  },
};

type FilterKey = "all" | "draft" | "published" | "archived";

const FILTERS: { key: FilterKey; label: string; status?: ContentStatus }[] = [
  { key: "all", label: "Toutes" },
  { key: "draft", label: "Brouillons", status: "DRAFT" },
  { key: "published", label: "Publiées", status: "PUBLISHED" },
  { key: "archived", label: "Archivées", status: "ARCHIVED" },
];

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDurationDelta(minutes: number): string {
  if (minutes === 0) return "+0 min";
  return `+${minutes} min`;
}

type SearchParams = { status?: FilterKey };

export default async function OptionsListPage({
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
  const where = filter.status ? { status: filter.status } : {};

  const [options, counts] = await Promise.all([
    prisma.serviceOption.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        addedDurationMinutes: true,
        addedPriceCents: true,
        applicableCategories: true,
        displayOrder: true,
      },
    }),
    fetchCounts(),
  ]);

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8 mb-8">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Catalogue
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Options supplémentaires
          </h1>
          <div className="mt-4">
            <CatalogToggle active="options" />
          </div>
        </div>
        <div className="shrink-0">
          <Link
            href="/admin/prestations/options/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nouvelle option
          </Link>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Filtrer par statut"
        className="flex flex-wrap gap-2 mb-6"
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            count={counts[f.key]}
            active={filter.key === f.key}
            href={f.key === "all" ? "/admin/prestations/options" : `/admin/prestations/options?status=${f.key}`}
          />
        ))}
      </nav>

      {options.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune option dans ce filtre.
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {options.map((o) => {
            const status = STATUS_META[o.status];
            return (
              <li key={o.id}>
                <Link
                  href={`/admin/prestations/options/${o.id}`}
                  className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 md:gap-6 items-center px-5 py-4 hover:bg-[var(--color-bone)] transition-colors"
                >
                  <div className="min-w-0">
                    <p
                      className="text-base leading-tight"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {o.title}
                    </p>
                    <p
                      className="text-xs text-[var(--color-ink-500)] mt-1"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {formatDurationDelta(o.addedDurationMinutes)} ·{" "}
                      +{formatCents(o.addedPriceCents)} (privé)
                    </p>
                    {o.applicableCategories.length > 0 && (
                      <p
                        className="text-[11px] text-[var(--color-ink-500)] mt-1.5 truncate"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        Applicable :{" "}
                        {o.applicableCategories
                          .map((c) => CATEGORY_LABELS[c])
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${status.cls}`}
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dotCls}`} />
                    {status.label}
                  </span>

                  <span
                    className="text-xs text-[var(--color-ink-500)] whitespace-nowrap"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    Ordre {o.displayOrder}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] ${
          active
            ? "bg-white/20 text-white"
            : "bg-[var(--color-paper)] text-[var(--color-ink-500)]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

async function fetchCounts(): Promise<Record<FilterKey, number>> {
  const [all, draft, published, archived] = await Promise.all([
    prisma.serviceOption.count(),
    prisma.serviceOption.count({ where: { status: "DRAFT" } }),
    prisma.serviceOption.count({ where: { status: "PUBLISHED" } }),
    prisma.serviceOption.count({ where: { status: "ARCHIVED" } }),
  ]);
  return { all, draft, published, archived };
}
