/**
 * /admin/newsletter/campagnes — Liste des campagnes newsletter.
 *
 * Filtres : ?status=all|draft|scheduled|sent|failed (défaut all).
 * Tri : updatedAt DESC.
 */

import type { Metadata } from "next";
import type { NewsletterCampaignStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewsletterTabs } from "../_tabs";
import { DeleteCampaignButton } from "./delete-campaign-button";

export const metadata: Metadata = {
  title: "Campagnes newsletter · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_META: Record<
  NewsletterCampaignStatus,
  { label: string; cls: string; dotCls: string }
> = {
  DRAFT: {
    label: "Brouillon",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
    dotCls: "bg-[var(--color-ink-500)]",
  },
  SCHEDULED: {
    label: "Programmée",
    cls: "bg-[var(--color-violet-50)] text-[var(--color-violet-700)]",
    dotCls: "bg-[var(--color-violet-600)]",
  },
  SENDING: {
    label: "Envoi…",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
    dotCls: "bg-[var(--color-warning)]",
  },
  SENT: {
    label: "Envoyée",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
    dotCls: "bg-[var(--color-success)]",
  },
  FAILED: {
    label: "Échec",
    cls: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
    dotCls: "bg-[var(--color-danger)]",
  },
  CANCELLED: {
    label: "Annulée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    dotCls: "bg-[var(--color-ink-300)]",
  },
};

type FilterKey = "all" | "draft" | "scheduled" | "sent" | "failed";

const FILTERS: {
  key: FilterKey;
  label: string;
  where?: Prisma.NewsletterCampaignWhereInput;
}[] = [
  { key: "all", label: "Toutes" },
  { key: "draft", label: "Brouillons", where: { status: "DRAFT" } },
  { key: "scheduled", label: "Programmées", where: { status: "SCHEDULED" } },
  {
    key: "sent",
    label: "Envoyées",
    where: { status: { in: ["SENT", "SENDING"] } },
  },
  {
    key: "failed",
    label: "Échecs",
    where: { status: { in: ["FAILED", "CANCELLED"] } },
  },
];

type SearchParams = { status?: FilterKey };

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatScheduled(d: Date): string {
  const day = d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} à ${time.replace(":", "h")}`;
}

export default async function CampagnesListPage({
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

  const where: Prisma.NewsletterCampaignWhereInput = filter.where ?? {};

  const [campaigns, counts] = await Promise.all([
    prisma.newsletterCampaign.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        subject: true,
        preheader: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        updatedAt: true,
        recipientCount: true,
        sentCount: true,
        failedCount: true,
        deliveredCount: true,
        openedCount: true,
        clickedCount: true,
      },
    }),
    fetchCounts(),
  ]);

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10 space-y-6">
      <NewsletterTabs current="campagnes" />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Newsletter
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Campagnes
          </h1>
        </div>
        <Link
          href="/admin/newsletter/campagnes/new"
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nouvelle campagne
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
              f.key === "all"
                ? "/admin/newsletter/campagnes"
                : `/admin/newsletter/campagnes?status=${f.key}`
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

      {campaigns.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune campagne dans ce filtre.
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {campaigns.map((c) => {
            const meta = STATUS_META[c.status];
            const recipients = c.recipientCount;
            const openRate =
              recipients > 0
                ? ((c.openedCount / recipients) * 100).toFixed(1)
                : "0";
            const clickRate =
              recipients > 0
                ? ((c.clickedCount / recipients) * 100).toFixed(1)
                : "0";

            return (
              <li key={c.id} className="relative">
                <Link
                  href={`/admin/newsletter/campagnes/${c.id}`}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_auto] gap-4 items-start p-4 hover:bg-[var(--color-bone)] transition-colors"
                >
                  <div className="min-w-0">
                    <p
                      className="text-base leading-tight text-[var(--color-ink-900)] line-clamp-1"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {c.subject}
                    </p>
                    {c.preheader && (
                      <p
                        className="text-xs text-[var(--color-ink-500)] mt-1 line-clamp-1"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {c.preheader}
                      </p>
                    )}
                  </div>

                  <div className="hidden sm:flex flex-col gap-1.5 items-start">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${meta.cls}`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotCls}`} />
                      {meta.label}
                    </span>
                    <span
                      className="text-[11px] text-[var(--color-ink-500)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {recipients} destinataire{recipients > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                    {c.status === "SENT" && (
                      <>
                        <span
                          className="text-[11px] text-[var(--color-ink-900)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          ouvert : {openRate} %
                        </span>
                        <span
                          className="text-[11px] text-[var(--color-ink-500)]"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          cliqué : {clickRate} %
                        </span>
                      </>
                    )}
                    {c.status === "SCHEDULED" && c.scheduledAt && (
                      <span
                        className="text-[11px] text-[var(--color-violet-700)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        Pour le {formatScheduled(c.scheduledAt)}
                      </span>
                    )}
                    {c.status === "DRAFT" && (
                      <span
                        className="text-[11px] text-[var(--color-ink-500)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        Brouillon · maj {formatDateShort(c.updatedAt)}
                      </span>
                    )}
                    {c.status === "SENDING" && (
                      <span
                        className="text-[11px] text-[var(--color-warning)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        Envoi en cours…
                      </span>
                    )}
                    {c.status === "FAILED" && (
                      <span
                        className="text-[11px] text-[var(--color-danger)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {c.failedCount} échec{c.failedCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {c.status === "CANCELLED" && (
                      <span
                        className="text-[11px] text-[var(--color-ink-500)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        Annulée
                      </span>
                    )}
                  </div>
                </Link>
                {c.status === "DRAFT" && (
                  <div className="absolute right-3 top-3">
                    <DeleteCampaignButton id={c.id} subject={c.subject} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function fetchCounts(): Promise<Record<FilterKey, number>> {
  const [all, draft, scheduled, sent, failed] = await Promise.all([
    prisma.newsletterCampaign.count(),
    prisma.newsletterCampaign.count({ where: { status: "DRAFT" } }),
    prisma.newsletterCampaign.count({ where: { status: "SCHEDULED" } }),
    prisma.newsletterCampaign.count({
      where: { status: { in: ["SENT", "SENDING"] } },
    }),
    prisma.newsletterCampaign.count({
      where: { status: { in: ["FAILED", "CANCELLED"] } },
    }),
  ]);
  return { all, draft, scheduled, sent, failed };
}
