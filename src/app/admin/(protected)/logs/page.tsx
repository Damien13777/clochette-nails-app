/**
 * /admin/logs — Journal d'audit des actions admin.
 *
 * Filtres :
 *  - ?domain=all|booking|gift_card|contact|calendar|platform|uploads|other
 *  - ?q=… (recherche admin name/email)
 *  - ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *  - ?page=N (pagination)
 *
 * Affichage :
 *  - timestamp + admin + label FR de l'action + résumé contextuel
 *  - JSON brut dans <details> pour les power users
 */

import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ALL_DOMAINS,
  DOMAIN_LABELS,
  actionKeysMatchingLabel,
  actionMeta,
  summarizeMetadata,
  type AuditDomain,
  type AuditTone,
} from "@/lib/audit-log-display";

export const metadata: Metadata = {
  title: "Logs · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  domain?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};

const TONE_BADGE: Record<AuditTone, string> = {
  neutral: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
  success: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
};

function parseDomain(d?: string): AuditDomain | "all" {
  if (!d || d === "all") return "all";
  if (ALL_DOMAINS.includes(d as AuditDomain)) return d as AuditDomain;
  return "all";
}

function parseDate(s?: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildQueryString(
  params: SearchParams,
  overrides: Partial<SearchParams> = {},
): string {
  const merged: SearchParams = { ...params, ...overrides };
  const sp = new URLSearchParams();
  if (merged.domain && merged.domain !== "all") sp.set("domain", merged.domain);
  if (merged.q) sp.set("q", merged.q);
  if (merged.from) sp.set("from", merged.from);
  if (merged.to) sp.set("to", merged.to);
  if (merged.page && merged.page !== "1") sp.set("page", merged.page);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const domain = parseDomain(params.domain);
  const q = (params.q ?? "").trim();
  const from = parseDate(params.from);
  const to = parseDate(params.to);
  const toEnd = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {};

  if (domain !== "all") {
    // On filtre par préfixe d'action (domaine = première partie avant le ".")
    where.action = { startsWith: `${domain}.` };
  }
  if (from || toEnd) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(toEnd ? { lt: toEnd } : {}),
    };
  }
  // Pré-calcul des action keys dont le label FR matche q (accent-insensible)
  const matchingActionKeys = q.length > 0 ? actionKeysMatchingLabel(q) : [];

  if (q.length > 0) {
    // Recherche flexible :
    //  - label FR de l'action (ex: "annulé" → booking.cancelled_admin, gift_card.cancelled, contact.deleted)
    //  - nom technique d'action (ex: "cancel" → idem mais via le préfixe DB)
    //  - JSON metadata (ex: ID booking, ID carte, prefix carte)
    where.OR = [
      ...(matchingActionKeys.length > 0
        ? [{ action: { in: matchingActionKeys } }]
        : []),
      { action: { contains: q, mode: "insensitive" } },
      { metadata: { string_contains: q } },
    ];
  }

  const [logs, total, counts] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        admin: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    fetchDomainCounts(where, q, from, toEnd),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1400px] mx-auto p-6 lg:p-8 space-y-6">
      <header className="space-y-2">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Système
        </p>
        <h1 className="text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Logs d&apos;audit
        </h1>
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Toutes les actions admin tracées dans l&apos;application.
        </p>
      </header>

      {/* Recherche + filtres dates */}
      <form
        action="/admin/logs"
        method="get"
        className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2"
      >
        {domain !== "all" && (
          <input type="hidden" name="domain" value={domain} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Action, ID booking/carte, préfixe…"
          className="px-4 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
          style={{ fontFamily: "var(--font-ui)" }}
        />
        <input
          type="date"
          name="from"
          defaultValue={params.from ?? ""}
          aria-label="Du"
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
          style={{ fontFamily: "var(--font-ui)", WebkitAppearance: "none", appearance: "none" }}
        />
        <input
          type="date"
          name="to"
          defaultValue={params.to ?? ""}
          aria-label="Au"
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
          style={{ fontFamily: "var(--font-ui)", WebkitAppearance: "none", appearance: "none" }}
        />
        <button
          type="submit"
          className="px-5 h-9 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Filtrer
        </button>
      </form>

      {/* Filtres domaine */}
      <nav
        role="tablist"
        aria-label="Filtrer par domaine"
        className="flex flex-wrap gap-2"
      >
        <DomainChip
          label="Tous"
          count={counts.all}
          active={domain === "all"}
          href={`/admin/logs${buildQueryString(params, { domain: undefined, page: "1" })}`}
        />
        {ALL_DOMAINS.map((d) => (
          <DomainChip
            key={d}
            label={DOMAIN_LABELS[d]}
            count={counts[d] ?? 0}
            active={domain === d}
            href={`/admin/logs${buildQueryString(params, { domain: d, page: "1" })}`}
          />
        ))}
      </nav>

      {/* Liste */}
      {logs.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucun log pour ce filtre.
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {logs.map((log) => {
            const meta = actionMeta(log.action);
            const summary = summarizeMetadata(log.metadata);
            return (
              <li key={log.id} className="p-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <time
                    dateTime={log.createdAt.toISOString()}
                    className="text-xs text-[var(--color-ink-500)] shrink-0 tabular-nums"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {formatDateTime(log.createdAt)}
                  </time>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em] ${TONE_BADGE[meta.tone]}`}
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {DOMAIN_LABELS[meta.domain]}
                  </span>
                </div>

                <div
                  className="flex flex-wrap items-baseline gap-x-3 mt-1.5 text-sm"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  <span className="text-[var(--color-ink-900)]">
                    {log.admin.name ?? log.admin.email}
                  </span>
                  {summary.id && summary.entity === "booking" && (
                    <Link
                      href={`/admin/bookings/${summary.id}`}
                      className="text-xs text-[var(--color-violet-700)] hover:underline"
                    >
                      → RDV {summary.id.slice(0, 8)}
                    </Link>
                  )}
                  {summary.id && summary.entity === "gift_card" && (
                    <Link
                      href={`/admin/cartes-cadeau/${summary.id}`}
                      className="text-xs text-[var(--color-violet-700)] hover:underline"
                    >
                      → Carte {summary.id.slice(0, 8)}
                    </Link>
                  )}
                  {summary.id && summary.entity === "contact" && (
                    <Link
                      href={`/admin/contacts/${summary.id}`}
                      className="text-xs text-[var(--color-violet-700)] hover:underline"
                    >
                      → Message {summary.id.slice(0, 8)}
                    </Link>
                  )}
                </div>

                {log.metadata !== null && log.metadata !== undefined && (
                  <details className="mt-2 group">
                    <summary
                      className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-500)] cursor-pointer hover:text-[var(--color-violet-700)] inline-flex items-center gap-1 select-none"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Détails JSON
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-180">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </summary>
                    <pre
                      className="mt-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-bone)] text-[11px] text-[var(--color-ink-700)] overflow-x-auto"
                      style={{ fontFamily: "monospace" }}
                    >
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3">
          <p
            className="text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {total} entrée{total > 1 ? "s" : ""} · page {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/logs${buildQueryString(params, { page: String(page - 1) })}`}
                className="px-3 h-8 inline-flex items-center rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ← Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/logs${buildQueryString(params, { page: String(page + 1) })}`}
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

function DomainChip({
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
      className={`inline-flex items-center gap-2 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] ${
          active
            ? "bg-white/25 text-white"
            : "bg-[var(--color-bone)] text-[var(--color-ink-700)]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

async function fetchDomainCounts(
  baseWhere: Prisma.AuditLogWhereInput,
  q: string,
  from: Date | null,
  toEnd: Date | null,
): Promise<Record<AuditDomain | "all", number>> {
  // On retire le filtre `action` du baseWhere pour compter chaque domaine
  // avec les MÊMES autres filtres (recherche + dates).
  const sharedWhere: Prisma.AuditLogWhereInput = {};
  if (from || toEnd) {
    sharedWhere.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(toEnd ? { lt: toEnd } : {}),
    };
  }
  if (q.length > 0) {
    const matchingKeys = actionKeysMatchingLabel(q);
    sharedWhere.OR = [
      ...(matchingKeys.length > 0 ? [{ action: { in: matchingKeys } }] : []),
      { action: { contains: q, mode: "insensitive" } },
      { metadata: { string_contains: q } },
    ];
  }
  void baseWhere; // baseWhere inclut déjà l'action ; on l'évite ici exprès

  const [
    all,
    booking,
    gift_card,
    contact,
    calendar,
    platform,
    uploads,
  ] = await Promise.all([
    prisma.auditLog.count({ where: sharedWhere }),
    prisma.auditLog.count({
      where: { ...sharedWhere, action: { startsWith: "booking." } },
    }),
    prisma.auditLog.count({
      where: { ...sharedWhere, action: { startsWith: "gift_card." } },
    }),
    prisma.auditLog.count({
      where: { ...sharedWhere, action: { startsWith: "contact." } },
    }),
    prisma.auditLog.count({
      where: { ...sharedWhere, action: { startsWith: "calendar." } },
    }),
    prisma.auditLog.count({
      where: { ...sharedWhere, action: { startsWith: "platform." } },
    }),
    prisma.auditLog.count({
      where: { ...sharedWhere, action: { startsWith: "uploads." } },
    }),
  ]);
  const other = all - booking - gift_card - contact - calendar - platform - uploads;
  return {
    all,
    booking,
    gift_card,
    contact,
    calendar,
    platform,
    uploads,
    other: Math.max(0, other),
  };
}
