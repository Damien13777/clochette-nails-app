/**
 * /admin/ebooks/ventes — Liste des ventes d'ebooks (EbookPurchase).
 *
 * Filtres : ?status=all|paid|refunded|pending (défaut all)
 *           ?q=<email|nom>, ?ebook=<ebookId>, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD
 *           ?page=N (pagination par 30)
 * Tri : purchasedAt DESC.
 */

import type { Metadata } from "next";
import type { PaymentStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_DOWNLOADS_PER_TOKEN } from "@/lib/ebook-download-token";
import { EbooksTabs } from "../_tabs";

export const metadata: Metadata = {
  title: "Ventes ebooks · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type FilterKey = "all" | "paid" | "refunded" | "pending";

const FILTERS: {
  key: FilterKey;
  label: string;
  status?: PaymentStatus;
}[] = [
  { key: "all", label: "Toutes" },
  { key: "paid", label: "Payées", status: "PAID" },
  { key: "refunded", label: "Remboursées", status: "REFUNDED" },
  { key: "pending", label: "En attente", status: "PENDING" },
];

const STATUS_META: Record<
  PaymentStatus,
  { label: string; cls: string; dotCls: string }
> = {
  PAID: {
    label: "Payé",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
    dotCls: "bg-[var(--color-success)]",
  },
  REFUNDED: {
    label: "Remboursé",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
    dotCls: "bg-[var(--color-warning)]",
  },
  PENDING: {
    label: "En attente",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
  FAILED: {
    label: "Échoué",
    cls: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
    dotCls: "bg-[var(--color-danger)]",
  },
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDate(input: string | undefined): Date | null {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

type SearchParams = {
  status?: string;
  q?: string;
  ebook?: string;
  from?: string;
  to?: string;
  page?: string;
};

function buildQuery(
  params: SearchParams,
  override: Partial<Record<keyof SearchParams, string | undefined>>,
): string {
  const out = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    status: params.status,
    q: params.q,
    ebook: params.ebook,
    from: params.from,
    to: params.to,
    page: params.page,
    ...override,
  };
  for (const [k, v] of Object.entries(merged)) {
    if (v && v.length > 0) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

export default async function EbookSalesPage({
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
  const q = (params.q ?? "").trim();
  const ebookId = (params.ebook ?? "").trim();
  const from = parseDate(params.from);
  const to = parseDate(params.to);
  const toEnd = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.EbookPurchaseWhereInput = {};
  if (filter.status) where.paymentStatus = filter.status;
  if (ebookId) where.ebookId = ebookId;
  if (from || toEnd) {
    where.purchasedAt = {
      ...(from ? { gte: from } : {}),
      ...(toEnd ? { lt: toEnd } : {}),
    };
  }
  if (q.length > 0) {
    where.OR = [
      { clientEmail: { contains: q, mode: "insensitive" } },
      { clientName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [purchases, total, counts, ebooksList] = await Promise.all([
    prisma.ebookPurchase.findMany({
      where,
      orderBy: { purchasedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        clientEmail: true,
        clientName: true,
        paymentStatus: true,
        amount: true,
        downloadCount: true,
        purchasedAt: true,
        ebookId: true,
        ebook: { select: { id: true, title: true } },
        giftCardRedemption: {
          select: {
            amountUsedCents: true,
            reversedAt: true,
          },
        },
      },
    }),
    prisma.ebookPurchase.count({ where }),
    fetchStatusCounts(where, filter.status),
    prisma.ebook.findMany({
      where: { purchases: { some: {} } },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10 space-y-6">
      <EbooksTabs current="ventes" />

      <header className="space-y-3">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Suivi
        </p>
        <h1
          className="text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Ventes d&apos;ebooks
        </h1>
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Total : {counts.all} · Payé : {counts.paid} · Remboursé : {counts.refunded} · En attente : {counts.pending}
        </p>
      </header>

      <form
        action="/admin/ebooks/ventes"
        method="get"
        className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2"
      >
        {filter.key !== "all" && (
          <input type="hidden" name="status" value={filter.key} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Email ou nom de la cliente…"
          className="px-4 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
          style={{ fontFamily: "var(--font-ui)" }}
        />
        <select
          name="ebook"
          defaultValue={ebookId}
          aria-label="Filtrer par ebook"
          className="px-4 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors max-w-[260px]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <option value="">Tous les ebooks</option>
          {ebooksList.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={params.from ?? ""}
          aria-label="Du"
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
          style={{
            fontFamily: "var(--font-ui)",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
        <input
          type="date"
          name="to"
          defaultValue={params.to ?? ""}
          aria-label="Au"
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
          style={{
            fontFamily: "var(--font-ui)",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center px-5 h-9 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Filtrer
        </button>
      </form>

      <nav
        role="tablist"
        aria-label="Filtrer par statut"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => {
          const count = counts[f.key];
          const isActive = filter.key === f.key;
          const href = `/admin/ebooks/ventes${buildQuery(params, {
            status: f.key === "all" ? undefined : f.key,
            page: undefined,
          })}`;
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

      {purchases.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune vente ne correspond à ces filtres.
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {purchases.map((p) => {
            const status = STATUS_META[p.paymentStatus];
            const gcActive =
              p.giftCardRedemption && !p.giftCardRedemption.reversedAt;
            const gcCents = gcActive ? p.giftCardRedemption!.amountUsedCents : 0;
            const stripeCents = Math.max(0, p.amount - gcCents);
            const paymentLabel =
              gcCents > 0 && stripeCents > 0
                ? "Mix"
                : gcCents > 0
                ? "Carte cadeau"
                : "Stripe";
            const paymentCls =
              paymentLabel === "Mix"
                ? "bg-[var(--color-violet-50)] text-[var(--color-violet-700)]"
                : paymentLabel === "Carte cadeau"
                ? "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]"
                : "bg-[var(--color-bone)] text-[var(--color-ink-700)]";

            return (
              <li key={p.id}>
                <div className="grid grid-cols-[1fr_auto] gap-4 items-start px-5 py-4 hover:bg-[var(--color-bone)] transition-colors">
                  <div className="min-w-0 grid grid-cols-1 lg:grid-cols-[150px_1fr_auto_auto_auto_auto] gap-3 lg:gap-5 items-center">
                    <span
                      className="text-xs text-[var(--color-ink-500)] whitespace-nowrap tabular-nums"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {formatDateTime(p.purchasedAt)}
                    </span>

                    <div className="min-w-0">
                      <p
                        className="text-sm text-[var(--color-ink-900)] truncate"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {p.clientName || "—"}
                      </p>
                      <p
                        className="text-xs text-[var(--color-ink-500)] truncate"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {p.clientEmail}
                      </p>
                    </div>

                    <Link
                      href={`/admin/ebooks/${p.ebookId}`}
                      className="text-xs text-[var(--color-violet-700)] hover:underline truncate"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {p.ebook.title}
                    </Link>

                    <span
                      className="text-sm text-[var(--color-ink-900)] text-right whitespace-nowrap tabular-nums"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {formatCents(p.amount)}
                    </span>

                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] whitespace-nowrap ${paymentCls}`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {paymentLabel}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] whitespace-nowrap ${status.cls}`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dotCls}`} />
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="text-xs text-[var(--color-ink-500)] whitespace-nowrap tabular-nums"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      DL {p.downloadCount}/{MAX_DOWNLOADS_PER_TOKEN}
                    </span>
                    <Link
                      href={`/admin/ebooks/ventes/${p.id}`}
                      aria-label={`Voir le détail de la vente ${p.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] hover:bg-[var(--color-paper)] transition-colors"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3">
          <p
            className="text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {total} vente{total > 1 ? "s" : ""} · page {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/ebooks/ventes${buildQuery(params, { page: String(page - 1) })}`}
                className="px-3 h-8 inline-flex items-center rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ← Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/ebooks/ventes${buildQuery(params, { page: String(page + 1) })}`}
                className="px-3 h-8 inline-flex items-center rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Suivant →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

async function fetchStatusCounts(
  baseWhere: Prisma.EbookPurchaseWhereInput,
  currentStatus: PaymentStatus | undefined,
): Promise<Record<FilterKey, number>> {
  const shared: Prisma.EbookPurchaseWhereInput = { ...baseWhere };
  if (currentStatus) delete shared.paymentStatus;

  const [all, paid, refunded, pending] = await Promise.all([
    prisma.ebookPurchase.count({ where: shared }),
    prisma.ebookPurchase.count({
      where: { ...shared, paymentStatus: "PAID" },
    }),
    prisma.ebookPurchase.count({
      where: { ...shared, paymentStatus: "REFUNDED" },
    }),
    prisma.ebookPurchase.count({
      where: { ...shared, paymentStatus: "PENDING" },
    }),
  ]);
  return { all, paid, refunded, pending };
}
