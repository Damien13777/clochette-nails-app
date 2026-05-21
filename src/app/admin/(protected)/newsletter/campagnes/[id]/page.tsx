/**
 * /admin/newsletter/campagnes/[id] — Édition campagne (DRAFT/SCHEDULED) ou
 * vue read-only (SENDING/SENT/FAILED) avec stats + liste des échecs.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { NewsletterCampaignStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { NewsletterTabs } from "../../_tabs";
import { CampaignForm } from "./campaign-form";

export const metadata: Metadata = {
  title: "Campagne · Admin",
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

function pct(num: number, total: number): string {
  if (total <= 0) return "0,0 %";
  return ((num / total) * 100).toFixed(1).replace(".", ",") + " %";
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
  });
  if (!campaign) notFound();

  const isEditable =
    campaign.status === "DRAFT" || campaign.status === "SCHEDULED";

  const meta = STATUS_META[campaign.status];

  return (
    <div className="max-w-[900px] px-5 lg:px-8 py-10 space-y-8">
      <NewsletterTabs current="campagnes" />

      <nav>
        <Link
          href="/admin/newsletter/campagnes"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour aux campagnes
        </Link>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Newsletter · Campagne
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {campaign.subject}
          </h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${meta.cls}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dotCls}`} />
          {meta.label}
        </span>
      </header>

      {isEditable ? (
        <CampaignForm
          mode="edit"
          campaignId={campaign.id}
          initialValues={{
            subject: campaign.subject,
            preheader: campaign.preheader ?? "",
            content: campaign.content,
            status: campaign.status,
            scheduledAt: campaign.scheduledAt
              ? campaign.scheduledAt.toISOString()
              : null,
            lastTestSentTo: campaign.lastTestSentTo,
            lastTestSentAt: campaign.lastTestSentAt
              ? campaign.lastTestSentAt.toISOString()
              : null,
            audienceFilters:
              (campaign.audienceFilters as {
                sources?: string[];
                createdAfter?: string | null;
                createdBefore?: string | null;
              } | null) ?? null,
          }}
        />
      ) : (
        <ReadOnlyView campaign={campaign} />
      )}
    </div>
  );
}

async function ReadOnlyView({
  campaign,
}: {
  campaign: {
    id: string;
    subject: string;
    preheader: string | null;
    content: string;
    status: NewsletterCampaignStatus;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
    bouncedCount: number;
    complainedCount: number;
    sentAt: Date | null;
  };
}) {
  const safeHtml = sanitizeHtml(campaign.content);

  const failures = await prisma.newsletterDelivery.findMany({
    where: {
      campaignId: campaign.id,
      status: { in: ["FAILED", "BOUNCED", "COMPLAINED"] },
    },
    orderBy: { sentAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      status: true,
      errorMessage: true,
    },
  });

  const totalFailureLike =
    campaign.failedCount + campaign.bouncedCount + campaign.complainedCount;

  return (
    <div className="space-y-6">
      {/* Identité */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2 className="section-eyebrow">Identité</h2>
        <div className="space-y-1.5">
          <p
            className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sujet
          </p>
          <p
            className="text-[var(--color-ink-900)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {campaign.subject}
          </p>
        </div>
        {campaign.preheader && (
          <div className="space-y-1.5">
            <p
              className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Preheader
            </p>
            <p
              className="text-sm text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {campaign.preheader}
            </p>
          </div>
        )}
        {campaign.sentAt && (
          <p
            className="text-[11px] text-[var(--color-ink-500)] pt-2"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Envoyée le{" "}
            {campaign.sentAt.toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {/* Contenu */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2 className="section-eyebrow">Contenu</h2>
        <div
          className="rich-content max-w-none"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      </div>

      {/* Stats */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
        <h2 className="section-eyebrow">Statistiques</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Destinataires"
            value={campaign.recipientCount}
          />
          <StatCard
            label="Envoyés"
            value={campaign.sentCount}
            hint={`${campaign.sentCount} OK · ${campaign.failedCount} échec${
              campaign.failedCount > 1 ? "s" : ""
            }`}
          />
          <StatCard
            label="Livrés"
            value={campaign.deliveredCount}
            hint={pct(campaign.deliveredCount, campaign.recipientCount)}
          />
          <StatCard
            label="Ouverts"
            value={campaign.openedCount}
            hint={pct(campaign.openedCount, campaign.recipientCount)}
          />
          <StatCard
            label="Cliqués"
            value={campaign.clickedCount}
            hint={pct(campaign.clickedCount, campaign.recipientCount)}
          />
          {(campaign.bouncedCount > 0 || campaign.complainedCount > 0) && (
            <StatCard
              label="Bounces / Plaintes"
              value={campaign.bouncedCount + campaign.complainedCount}
              hint={`${campaign.bouncedCount} bounce${
                campaign.bouncedCount > 1 ? "s" : ""
              } · ${campaign.complainedCount} plainte${
                campaign.complainedCount > 1 ? "s" : ""
              }`}
              tone="danger"
            />
          )}
        </div>
      </div>

      {/* Échecs */}
      {failures.length > 0 && (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
          <h2 className="section-eyebrow">Échecs</h2>
          <p
            className="text-[11px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {failures.length === 50 && totalFailureLike > 50
              ? `Affichage des 50 premiers échecs (sur ${totalFailureLike}).`
              : `${failures.length} échec${failures.length > 1 ? "s" : ""} au total.`}
          </p>
          <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-hidden">
            {failures.map((f) => (
              <li
                key={f.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_120px_2fr] gap-2 px-3 py-2 text-xs"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                <span className="text-[var(--color-ink-900)] truncate">
                  {f.email}
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-ink-700)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {f.status}
                </span>
                <span className="text-[var(--color-ink-500)] line-clamp-2">
                  {f.errorMessage ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div className="bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] p-4">
      <p
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] leading-snug"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-medium ${
          tone === "danger"
            ? "text-[var(--color-danger)]"
            : "text-[var(--color-ink-900)]"
        }`}
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
