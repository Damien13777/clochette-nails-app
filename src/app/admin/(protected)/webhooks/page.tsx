/**
 * /admin/webhooks — Viewer des events webhook (entrants Stripe + sortants Management).
 *
 * Onglets via ?tab=in (défaut) / out :
 *  - in : 50 derniers StripeEvent (table de déduplication idempotente), liens
 *    directs vers le dashboard Stripe pour chaque event + bouton "voir tout"
 *  - out : 50 derniers OutboundEvent avec filtre ?status=PENDING|DELIVERED|FAILED|ABANDONED
 *
 * Le mode Stripe (test vs live) est détecté via STRIPE_SECRET_KEY pour
 * router vers le bon sous-domaine dashboard.stripe.com.
 */

import type { Metadata } from "next";
import type { OutboundEventStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { OutboundDetailButton } from "./outbound-actions";

export const metadata: Metadata = {
  title: "Webhooks · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const LIST_LIMIT = 50;

/** Renvoie "/test" ou "" selon STRIPE_SECRET_KEY (sk_test_ → test). */
function stripeDashboardPrefix(): string {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_live_") ? "" : "/test";
}

type TabKey = "in" | "out";

type StatusFilterKey = "all" | OutboundEventStatus;

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "PENDING", label: "En attente" },
  { key: "DELIVERED", label: "Livré" },
  { key: "FAILED", label: "Échec" },
  { key: "ABANDONED", label: "Abandonné" },
];

const STATUS_META: Record<OutboundEventStatus, { label: string; cls: string }> =
  {
    PENDING: {
      label: "En attente",
      cls: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
    },
    DELIVERED: {
      label: "Livré",
      cls: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
    },
    FAILED: {
      label: "Échec",
      cls: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
    },
    ABANDONED: {
      label: "Abandonné",
      cls: "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
    },
  };

function formatDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

type SearchParams = {
  tab?: string;
  status?: string;
};

function parseTab(value: string | undefined): TabKey {
  return value === "out" ? "out" : "in";
}

function parseStatusFilter(value: string | undefined): StatusFilterKey {
  if (
    value === "PENDING" ||
    value === "DELIVERED" ||
    value === "FAILED" ||
    value === "ABANDONED"
  ) {
    return value;
  }
  return "all";
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const tab = parseTab(params.tab);
  const statusFilter = parseStatusFilter(params.status);

  const outboundWhere: Prisma.OutboundEventWhereInput = {};
  if (statusFilter !== "all") outboundWhere.status = statusFilter;

  const [
    stripeEvents,
    outboundEvents,
    stripeCount,
    outboundCounts,
  ] = await Promise.all([
    prisma.stripeEvent.findMany({
      orderBy: { processedAt: "desc" },
      take: LIST_LIMIT,
      select: { id: true, type: true, processedAt: true },
    }),
    prisma.outboundEvent.findMany({
      where: outboundWhere,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        type: true,
        payload: true,
        targetUrl: true,
        targetService: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastError: true,
        createdAt: true,
        deliveredAt: true,
      },
    }),
    prisma.stripeEvent.count(),
    fetchOutboundCounts(),
  ]);

  const totalOutbound =
    outboundCounts.PENDING +
    outboundCounts.DELIVERED +
    outboundCounts.FAILED +
    outboundCounts.ABANDONED;

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10 space-y-6">
      <header className="space-y-3">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Système
        </p>
        <h1
          className="text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Webhooks
        </h1>
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Audit des événements reçus de Stripe + queue d&apos;envoi vers
          l&apos;API Management.
        </p>
      </header>

      <nav
        role="tablist"
        aria-label="Sections webhooks"
        className="flex flex-wrap gap-2"
      >
        <TabPill
          href="/admin/webhooks?tab=in"
          label="Reçus (Stripe)"
          count={stripeCount}
          isActive={tab === "in"}
        />
        <TabPill
          href="/admin/webhooks?tab=out"
          label="Sortants (Management)"
          count={totalOutbound}
          isActive={tab === "out"}
        />
      </nav>

      {tab === "in" ? (
        <StripeEventsTable
          events={stripeEvents.map((e) => ({
            id: e.id,
            type: e.type,
            processedAt: e.processedAt,
          }))}
          dashboardPrefix={stripeDashboardPrefix()}
        />
      ) : (
        <OutboundSection
          events={outboundEvents.map((e) => ({
            id: e.id,
            type: e.type,
            payload: e.payload,
            targetUrl: e.targetUrl,
            targetService: e.targetService,
            status: e.status,
            attempts: e.attempts,
            maxAttempts: e.maxAttempts,
            nextAttemptAt: e.nextAttemptAt,
            lastError: e.lastError,
            createdAt: e.createdAt,
            deliveredAt: e.deliveredAt,
          }))}
          statusFilter={statusFilter}
          counts={outboundCounts}
          total={totalOutbound}
        />
      )}
    </div>
  );
}

function TabPill({
  href,
  label,
  count,
  isActive,
}: {
  href: string;
  label: string;
  count: number;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={isActive}
      aria-current={isActive ? "page" : undefined}
      className={`inline-flex items-center gap-2 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
        isActive
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
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
}

function StripeEventsTable({
  events,
  dashboardPrefix,
}: {
  events: { id: string; type: string; processedAt: Date }[];
  dashboardPrefix: string;
}) {
  if (events.length === 0) {
    return (
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucun event encore reçu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
        {events.map((e) => {
          const stripeUrl = `https://dashboard.stripe.com${dashboardPrefix}/events/${e.id}`;
          return (
            <li key={e.id}>
              <a
                href={stripeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-1 lg:grid-cols-[180px_1fr_auto_auto] gap-3 lg:gap-5 items-center px-5 py-3 hover:bg-[var(--color-bone)]/60 transition-colors"
                title="Voir le détail sur Stripe Dashboard"
              >
                <span
                  className="text-xs text-[var(--color-ink-500)] whitespace-nowrap tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {formatDateTime(e.processedAt)}
                </span>
                <span
                  className="text-[11px] font-mono text-[var(--color-ink-700)] truncate"
                  title={e.id}
                >
                  {e.id}
                </span>
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] whitespace-nowrap bg-[var(--color-violet-50)] text-[var(--color-violet-700)] justify-self-start lg:justify-self-end"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {e.type}
                </span>
                <svg
                  className="hidden lg:block text-[var(--color-ink-300)] group-hover:text-[var(--color-violet-700)]"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                </svg>
              </a>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p
          className="text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Ces events sont stockés pour garantir l&apos;idempotence du webhook
          Stripe. Cliquez sur une ligne pour ouvrir l&apos;event sur Stripe.
        </p>
        <a
          href={`https://dashboard.stripe.com${dashboardPrefix}/events`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-violet-700)] hover:underline whitespace-nowrap"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Voir tous les events sur Stripe
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
        </a>
      </div>
    </div>
  );
}

type OutboundRow = {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  targetUrl: string;
  targetService: string;
  status: OutboundEventStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
};

function OutboundSection({
  events,
  statusFilter,
  counts,
  total,
}: {
  events: OutboundRow[];
  statusFilter: StatusFilterKey;
  counts: Record<OutboundEventStatus, number>;
  total: number;
}) {
  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="Filtrer par statut"
        className="flex flex-wrap gap-2"
      >
        {STATUS_FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? total
              : counts[f.key];
          const isActive = statusFilter === f.key;
          const href =
            f.key === "all"
              ? "/admin/webhooks?tab=out"
              : `/admin/webhooks?tab=out&status=${f.key}`;
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

      {events.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {statusFilter === "all"
              ? "Aucun event en attente."
              : "Aucun event ne correspond à ce filtre."}
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {events.map((e) => {
            const status = STATUS_META[e.status];
            return (
              <li
                key={e.id}
                className="grid grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto] gap-3 lg:gap-4 items-center px-5 py-3 hover:bg-[var(--color-bone)]/60 transition-colors"
              >
                <span
                  className="text-xs text-[var(--color-ink-500)] whitespace-nowrap tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {formatDateTime(e.createdAt)}
                </span>
                <span
                  className="text-sm text-[var(--color-ink-900)] truncate"
                  style={{ fontFamily: "var(--font-ui)" }}
                  title={e.type}
                >
                  {e.type}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] whitespace-nowrap justify-self-start ${status.cls}`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {status.label}
                </span>
                <span
                  className="text-[11px] text-[var(--color-ink-500)] whitespace-nowrap tabular-nums justify-self-start lg:justify-self-end"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {e.attempts}/{e.maxAttempts}
                </span>
                <span
                  className="text-[11px] text-[var(--color-ink-500)] truncate"
                  style={{ fontFamily: "var(--font-ui)" }}
                  title={e.lastError ?? ""}
                >
                  {e.lastError ? truncate(e.lastError, 80) : "—"}
                </span>
                <div className="justify-self-start lg:justify-self-end">
                  <OutboundDetailButton
                    event={{
                      id: e.id,
                      type: e.type,
                      payload: e.payload,
                      targetUrl: e.targetUrl,
                      targetService: e.targetService,
                      status: e.status,
                      attempts: e.attempts,
                      maxAttempts: e.maxAttempts,
                      nextAttemptAt: e.nextAttemptAt.toISOString(),
                      lastError: e.lastError,
                      createdAt: e.createdAt.toISOString(),
                      deliveredAt: e.deliveredAt
                        ? e.deliveredAt.toISOString()
                        : null,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function fetchOutboundCounts(): Promise<
  Record<OutboundEventStatus, number>
> {
  const groups = await prisma.outboundEvent.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const result: Record<OutboundEventStatus, number> = {
    PENDING: 0,
    DELIVERED: 0,
    FAILED: 0,
    ABANDONED: 0,
  };
  for (const g of groups) {
    result[g.status] = g._count._all;
  }
  return result;
}
