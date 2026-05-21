/**
 * /admin/ebooks/ventes/[id] — Détail d'une vente d'ebook (EbookPurchase).
 *
 * Sections : cliente, ebook acheté, paiement (avec breakdown CB + GC + frais
 * Stripe), téléchargements, et panneau d'actions admin (resend / reissue /
 * refund) côté droit.
 */

import type { Metadata } from "next";
import type { PaymentStatus } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_DOWNLOADS_PER_TOKEN } from "@/lib/ebook-download-token";
import { EbooksTabs } from "../../_tabs";
import { SalesActions } from "./sales-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id },
    select: { ebook: { select: { title: true } } },
  });
  return {
    title: purchase
      ? `Vente · ${purchase.ebook.title} · Admin`
      : "Vente · Admin",
    robots: { index: false, follow: false },
  };
}

const STATUS_META: Record<PaymentStatus, { label: string; cls: string }> = {
  PAID: {
    label: "Payé",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
  },
  REFUNDED: {
    label: "Remboursé",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
  },
  PENDING: {
    label: "En attente",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
  },
  FAILED: {
    label: "Échoué",
    cls: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
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

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortenToken(token: string): string {
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export default async function EbookSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id },
    include: {
      ebook: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          coverImage: true,
          coverImageAlt: true,
        },
      },
      giftCardRedemption: {
        select: {
          id: true,
          amountUsedCents: true,
          reversedAt: true,
          giftCard: {
            select: { id: true, prefix: true },
          },
        },
      },
    },
  });
  if (!purchase) notFound();

  const status = STATUS_META[purchase.paymentStatus];

  const gcActive =
    purchase.giftCardRedemption && !purchase.giftCardRedemption.reversedAt;
  const gcCents = gcActive ? purchase.giftCardRedemption!.amountUsedCents : 0;
  const stripeCents = Math.max(0, purchase.amount - gcCents);
  const netStripeCents =
    purchase.stripeFeeCents != null
      ? stripeCents - purchase.stripeFeeCents
      : null;

  const now = new Date();
  const tokenExpired = purchase.tokenExpiresAt < now;
  const downloadsLeft = MAX_DOWNLOADS_PER_TOKEN - purchase.downloadCount;
  const downloadsExhausted = downloadsLeft <= 0;

  const canResend =
    purchase.paymentStatus === "PAID" && !tokenExpired && !downloadsExhausted;
  let canResendReason: string | null = null;
  if (purchase.paymentStatus !== "PAID") {
    canResendReason = "Achat non payé";
  } else if (tokenExpired) {
    canResendReason = "Le lien a expiré · utilise « Réémettre »";
  } else if (downloadsExhausted) {
    canResendReason = "Cap de téléchargements atteint · utilise « Réémettre »";
  }

  const ebookPublicHref =
    purchase.ebook.status === "PUBLISHED"
      ? `/ebooks/${purchase.ebook.slug}`
      : null;

  return (
    <div className="max-w-[1200px] mx-auto p-6 lg:p-8 space-y-6">
      <EbooksTabs current="ventes" />

      <nav>
        <Link
          href="/admin/ebooks/ventes"
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
          Retour aux ventes
        </Link>
      </nav>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] ${status.cls}`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {status.label}
              </span>
              <span
                className="text-xs text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Achetée le {formatDateTime(purchase.purchasedAt)}
              </span>
            </div>
            <h1
              className="text-2xl md:text-3xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {purchase.ebook.title}
            </h1>
            <p
              className="text-[11px] text-[var(--color-ink-500)] font-mono break-all"
              style={{ fontFamily: "monospace" }}
            >
              {purchase.id}
            </p>
          </header>

          <Section title="Cliente">
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label="Nom" value={purchase.clientName || "—"} />
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${purchase.clientEmail}`}
                    className="text-[var(--color-violet-700)] hover:underline"
                  >
                    {purchase.clientEmail}
                  </a>
                }
              />
            </dl>
          </Section>

          <Section title="Ebook acheté">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-bone)] border border-[var(--color-line)] shrink-0">
                {purchase.ebook.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={purchase.ebook.coverImage}
                    alt={purchase.ebook.coverImageAlt ?? ""}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[var(--color-ink-300)] text-xs">
                    —
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <Link
                  href={`/admin/ebooks/${purchase.ebook.id}`}
                  className="block text-base text-[var(--color-violet-700)] hover:underline"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {purchase.ebook.title}
                </Link>
                <p
                  className="text-xs text-[var(--color-ink-500)] font-mono"
                  style={{ fontFamily: "monospace" }}
                >
                  /{purchase.ebook.slug}
                </p>
                {ebookPublicHref && (
                  <a
                    href={ebookPublicHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    Voir la page publique
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 17L17 7M17 7H8M17 7v9" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </Section>

          <Section title="Paiement">
            <dl className="text-sm divide-y divide-[var(--color-line)]">
              <BreakdownRow
                label="Prix de l'ebook"
                value={formatCents(purchase.amount)}
              />
              {gcCents > 0 && purchase.giftCardRedemption && (
                <BreakdownRow
                  label={
                    <>
                      Carte cadeau{" "}
                      <Link
                        href={`/admin/cartes-cadeau/${purchase.giftCardRedemption.giftCard.id}`}
                        className="text-[var(--color-violet-700)] hover:underline font-mono"
                      >
                        •{purchase.giftCardRedemption.giftCard.prefix}
                      </Link>
                    </>
                  }
                  value={`− ${formatCents(gcCents)}`}
                  valueClass="text-[var(--color-violet-700)]"
                />
              )}
              <BreakdownRow
                label="Payé via CB"
                value={formatCents(stripeCents)}
                emphasis
              />
              {purchase.stripeFeeCents != null && (
                <BreakdownRow
                  label="Frais Stripe"
                  hint="Déduits par Stripe à l'encaissement"
                  value={`− ${formatCents(purchase.stripeFeeCents)}`}
                  valueClass="text-[var(--color-ink-500)]"
                />
              )}
              {netStripeCents != null && (
                <BreakdownRow
                  label="Net encaissé"
                  value={formatCents(netStripeCents)}
                  emphasis
                />
              )}
              {purchase.paymentStatus === "REFUNDED" &&
                purchase.refundedAmount != null &&
                purchase.refundedAmount > 0 && (
                  <BreakdownRow
                    label="Total remboursé (Stripe)"
                    value={`− ${formatCents(purchase.refundedAmount)}`}
                    valueClass="text-[var(--color-warning)]"
                  />
                )}
            </dl>

            {purchase.stripePaymentId && (
              <div className="mt-4">
                <a
                  href={`https://dashboard.stripe.com/test/payments/${purchase.stripePaymentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Voir dans Stripe Dashboard
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M7 17L17 7M17 7H8M17 7v9" />
                  </svg>
                </a>
              </div>
            )}

            {purchase.paidAt && (
              <p
                className="text-[11px] text-[var(--color-ink-500)] mt-3"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Encaissement confirmé le {formatDateTime(purchase.paidAt)}
              </p>
            )}
          </Section>

          <Section title="Téléchargements">
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <p
                  className="text-3xl text-[var(--color-violet-700)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {purchase.downloadCount}
                  <span className="text-[var(--color-ink-500)] text-base">
                    /{MAX_DOWNLOADS_PER_TOKEN}
                  </span>
                </p>
                {downloadsExhausted && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em] bg-[var(--color-warning)]/12 text-[var(--color-warning)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Épuisé
                  </span>
                )}
              </div>

              <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row
                  label="Dernier téléchargement"
                  value={
                    purchase.lastDownloadAt
                      ? formatDateTime(purchase.lastDownloadAt)
                      : "Jamais téléchargé"
                  }
                />
                <Row
                  label="Expiration du lien"
                  value={
                    <span
                      className={
                        tokenExpired
                          ? "text-[var(--color-warning)]"
                          : "text-[var(--color-ink-900)]"
                      }
                    >
                      {formatDateLong(purchase.tokenExpiresAt)}
                      {tokenExpired && (
                        <span
                          className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em] bg-[var(--color-warning)]/12 text-[var(--color-warning)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          Expiré
                        </span>
                      )}
                    </span>
                  }
                />
                <Row
                  label="Token"
                  value={
                    <code
                      className="text-[11px] text-[var(--color-ink-700)]"
                      style={{ fontFamily: "monospace" }}
                    >
                      {shortenToken(purchase.downloadToken)}
                    </code>
                  }
                  fullWidth
                />
              </dl>
            </div>
          </Section>
        </div>

        <aside>
          <div className="sticky top-20 space-y-4">
            {purchase.paymentStatus === "PAID" ? (
              <SalesActions
                id={purchase.id}
                canResend={canResend}
                canResendReason={canResendReason}
              />
            ) : (
              <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-2">
                <h2
                  className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Actions
                </h2>
                <p
                  className="text-xs text-[var(--color-ink-500)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Aucune action disponible :{" "}
                  {purchase.paymentStatus === "REFUNDED"
                    ? "cet achat a déjà été remboursé."
                    : purchase.paymentStatus === "PENDING"
                    ? "le paiement n'est pas confirmé."
                    : "le paiement a échoué."}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
      <h2
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <dt
        className="text-[var(--color-ink-500)] text-[10px] uppercase tracking-[0.14em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className="text-[var(--color-ink-900)] text-sm mt-0.5 break-words"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </dd>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  hint,
  valueClass,
  emphasis,
}: {
  label: React.ReactNode;
  value: string;
  hint?: string;
  valueClass?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p
          className={`text-sm ${
            emphasis
              ? "text-[var(--color-ink-900)]"
              : "text-[var(--color-ink-700)]"
          }`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {label}
        </p>
        {hint && (
          <p
            className="text-[11px] text-[var(--color-ink-500)] mt-0.5"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {hint}
          </p>
        )}
      </div>
      <p
        className={`text-sm whitespace-nowrap tabular-nums ${
          valueClass ??
          (emphasis
            ? "text-[var(--color-ink-900)]"
            : "text-[var(--color-ink-700)]")
        }`}
        style={{ fontFamily: emphasis ? "var(--font-serif)" : "var(--font-ui)" }}
      >
        {value}
      </p>
    </div>
  );
}
