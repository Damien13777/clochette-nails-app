/**
 * /admin/cartes-cadeau — liste des cartes cadeau émises.
 *
 * Filtres : ?status=all|active|partial|used|expired|cancelled (défaut active)
 * Recherche : ?q=<email|prefix|nom>
 *
 * Tri : expiresAt ASC (les plus urgentes en haut) pour active/partial,
 * sinon updatedAt DESC.
 */

import type { Metadata } from "next";
import type { GiftCardStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Cartes cadeau · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type FilterKey =
  | "all"
  | "active"
  | "partial"
  | "used"
  | "expired"
  | "cancelled";

const FILTERS: {
  key: FilterKey;
  label: string;
  statuses?: GiftCardStatus[];
}[] = [
  { key: "active", label: "Actives", statuses: ["ACTIVE"] },
  { key: "partial", label: "Entamées", statuses: ["PARTIALLY_USED"] },
  { key: "used", label: "Épuisées", statuses: ["FULLY_USED"] },
  { key: "expired", label: "Expirées", statuses: ["EXPIRED"] },
  { key: "cancelled", label: "Annulées", statuses: ["CANCELLED", "REFUNDED"] },
  { key: "all", label: "Toutes" },
];

const STATUS_META: Record<
  GiftCardStatus,
  { label: string; cls: string; dotCls: string }
> = {
  ACTIVE: {
    label: "Active",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
    dotCls: "bg-[var(--color-success)]",
  },
  PARTIALLY_USED: {
    label: "Entamée",
    cls: "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]",
    dotCls: "bg-[var(--color-violet-600)]",
  },
  FULLY_USED: {
    label: "Épuisée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
  EXPIRED: {
    label: "Expirée",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
    dotCls: "bg-[var(--color-warning)]",
  },
  REFUNDED: {
    label: "Remboursée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
  CANCELLED: {
    label: "Annulée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
  PENDING_PAYMENT: {
    label: "Paiement en cours",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type SearchParams = { status?: string; q?: string };

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const filter =
    FILTERS.find((f) => f.key === params.status) ??
    FILTERS.find((f) => f.key === "active")!;
  const q = (params.q ?? "").trim();

  const where: Prisma.GiftCardWhereInput = {};
  if (filter.statuses) where.status = { in: filter.statuses };
  if (q.length > 0) {
    const upper = q.toUpperCase();
    where.OR = [
      { prefix: { contains: upper, mode: "insensitive" } },
      { recipientEmail: { contains: q, mode: "insensitive" } },
      { recipientName: { contains: q, mode: "insensitive" } },
      { buyerEmail: { contains: q, mode: "insensitive" } },
      { buyerName: { contains: q, mode: "insensitive" } },
    ];
  }

  const isUrgentFilter = filter.key === "active" || filter.key === "partial";

  const [cards, counts] = await Promise.all([
    prisma.giftCard.findMany({
      where,
      orderBy: isUrgentFilter
        ? [{ expiresAt: "asc" }]
        : [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        prefix: true,
        status: true,
        initialAmountCents: true,
        remainingAmountCents: true,
        expiresAt: true,
        recipientName: true,
        recipientEmail: true,
        buyerName: true,
        createdAt: true,
        creationMode: true,
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
            Catalogue
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Cartes cadeau
          </h1>
        </div>
        <div className="shrink-0">
          <Link
            href="/admin/cartes-cadeau/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nouvelle carte cadeau
          </Link>
        </div>
      </header>

      {/* Recherche */}
      <form
        action="/admin/cartes-cadeau"
        method="get"
        className="flex flex-col sm:flex-row gap-2"
      >
        {filter.key !== "active" && (
          <input type="hidden" name="status" value={filter.key} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Code (4 derniers chars), email, nom…"
          className="flex-1 px-4 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
          style={{ fontFamily: "var(--font-ui)" }}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center px-5 h-9 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Rechercher
        </button>
        {q && (
          <Link
            href={
              filter.key === "active"
                ? "/admin/cartes-cadeau"
                : `/admin/cartes-cadeau?status=${filter.key}`
            }
            className="inline-flex items-center justify-center px-5 h-9 rounded-full text-xs uppercase tracking-[0.06em] text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Effacer
          </Link>
        )}
      </form>

      <nav
        role="tablist"
        aria-label="Filtrer par statut"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => {
          const count = counts[f.key];
          const isActive = filter.key === f.key;
          const href =
            f.key === "active"
              ? "/admin/cartes-cadeau"
              : `/admin/cartes-cadeau?status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={`inline-flex items-center gap-2 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-[var(--color-violet-600)] text-white"
                  : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {f.label}
              <span
                className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] ${
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-[var(--color-bone)] text-[var(--color-ink-700)]"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {cards.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {q
              ? "Aucune carte ne correspond à cette recherche."
              : "Aucune carte cadeau dans ce filtre."}
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {cards.map((c) => {
            const status = STATUS_META[c.status];
            const isExpired = c.expiresAt < new Date();
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/cartes-cadeau/${c.id}`}
                  className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[110px_1fr_auto_auto_auto] gap-3 sm:gap-5 items-center px-5 py-4 hover:bg-[var(--color-bone)] transition-colors"
                >
                  <span
                    className="font-mono text-sm text-[var(--color-ink-700)]"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    •{c.prefix}
                  </span>

                  <div className="min-w-0">
                    <p
                      className="text-sm text-[var(--color-ink-900)] truncate"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {c.recipientName || c.buyerName}
                    </p>
                    <p
                      className="text-xs text-[var(--color-ink-500)] truncate"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {c.recipientEmail ?? "—"}
                      {c.creationMode === "ADMIN_GIFT" && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.06em] text-[var(--color-violet-700)]">
                          · Cadeau
                        </span>
                      )}
                      {c.creationMode === "ADMIN_SALE" && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.06em] text-[var(--color-violet-700)]">
                          · Vente salon
                        </span>
                      )}
                    </p>
                  </div>

                  <span
                    className="hidden sm:block text-sm text-[var(--color-ink-900)] text-right whitespace-nowrap"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {formatCents(c.remainingAmountCents)}
                    <span className="text-xs text-[var(--color-ink-500)]">
                      {" "}
                      / {formatCents(c.initialAmountCents)}
                    </span>
                  </span>

                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] whitespace-nowrap ${status.cls}`}
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dotCls}`} />
                    {status.label}
                  </span>

                  <span
                    className={`text-xs whitespace-nowrap ${
                      isExpired && c.status !== "FULLY_USED"
                        ? "text-[var(--color-warning)]"
                        : "text-[var(--color-ink-500)]"
                    }`}
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    Exp. {formatDateShort(c.expiresAt)}
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

async function fetchCounts(): Promise<Record<FilterKey, number>> {
  const [all, active, partial, used, expired, cancelled] = await Promise.all([
    prisma.giftCard.count(),
    prisma.giftCard.count({ where: { status: "ACTIVE" } }),
    prisma.giftCard.count({ where: { status: "PARTIALLY_USED" } }),
    prisma.giftCard.count({ where: { status: "FULLY_USED" } }),
    prisma.giftCard.count({ where: { status: "EXPIRED" } }),
    prisma.giftCard.count({
      where: { status: { in: ["CANCELLED", "REFUNDED"] } },
    }),
  ]);
  return { all, active, partial, used, expired, cancelled };
}
