/**
 * Admin Dashboard — /admin
 *
 * Server Component qui fetch en parallèle :
 *  - 4 KPIs : CA mois, RDV cette semaine (+ sous-texte : mois en cours + à
 *    venir au total), GC actives, Contacts non lus
 *  - 5 prochains RDV (date >= today, status CONFIRMED/AWAITING_DEPOSIT)
 *  - Alertes agrégées (GC expirantes 30j, RDV awaiting > 1h, contacts unread)
 *
 * Anims : count-up sur les valeurs KPI (Client island), stagger fade-up
 * sur les grids (CSS pur via classe .stagger dans globals.css).
 */

import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CountUp } from "@/components/admin/dashboard/count-up";
import {
  STATUS_VISUAL,
  formatBookingDateShort,
  formatCents,
} from "@/lib/booking-display";
import {
  pastBookingsWhere,
  upcomingBookingsWhere,
} from "@/lib/booking-where";
import { mondayIsoForTodayParis, todayIsoParis } from "@/lib/paris-day";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tableau de bord · Administration",
  robots: { index: false, follow: false },
};

export default async function AdminDashboard() {
  const session = await auth();
  const userName = session?.user.name ?? "Chloé";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Bornes @db.Date (UTC-minuit calé sur le jour Paris) pour compter les RDV
  // par période — Booking.date est un @db.Date (cf. paris-day.ts).
  const weekStartDate = isoToUtcMidnight(mondayIsoForTodayParis());
  const weekEndDate = addUtcDays(weekStartDate, 7);
  const [parisYear, parisMonth] = todayIsoParis().split("-").map(Number);
  const monthStartDate = new Date(Date.UTC(parisYear, parisMonth - 1, 1));
  const nextMonthStartDate = new Date(Date.UTC(parisYear, parisMonth, 1));

  const [
    bookingsForRevenue,
    giftCardSalesAgg,
    ebookSalesRaw,
    bookingsThisWeek,
    bookingsThisMonth,
    upcomingBookingsCount,
    activeGiftCards,
    contactsUnread,
    upcomingBookings,
    expiringGiftCards,
    awaitingBookings,
    pendingCompletion,
  ] = await Promise.all([
    // RDV honorés du mois — on ramène les champs nécessaires pour calculer
    // le vrai CA (acompte Stripe net + complément cash), pas juste
    // revenueCents qui ne couvre que la portion cash du complément.
    prisma.booking.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: {
        depositCents: true,
        revenueCents: true,
        stripeFeeCents: true,
        refundedAmount: true,
        giftCardRedemptions: {
          where: { reversedAt: null },
          select: { amountUsedCents: true, type: true },
        },
      },
    }),
    // Ventes de cartes cadeau du mois (achats site OU vente en salon).
    // ADMIN_GIFT (geste commercial) exclu volontairement.
    prisma.giftCard.aggregate({
      _sum: { initialAmountCents: true },
      where: {
        creationMode: { in: ["PUBLIC", "ADMIN_SALE"] },
        paymentStatus: "PAID",
        paidAt: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    // Ventes ebook du mois — on ne compte que la portion STRIPE
    // (la portion carte cadeau est déjà comptée à la vente de la carte,
    // sinon double-comptage). Refunds déduits.
    prisma.ebookPurchase.findMany({
      where: {
        paymentStatus: "PAID",
        paidAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: {
        amount: true,
        refundedAmount: true,
        giftCardRedemption: {
          select: { amountUsedCents: true, reversedAt: true },
        },
      },
    }),
    // RDV de la semaine en cours (lundi→dimanche, Paris)
    prisma.booking.count({
      where: {
        status: { in: ["CONFIRMED", "COMPLETED"] },
        date: { gte: weekStartDate, lt: weekEndDate },
      },
    }),
    // RDV du mois en cours
    prisma.booking.count({
      where: {
        status: { in: ["CONFIRMED", "COMPLETED"] },
        date: { gte: monthStartDate, lt: nextMonthStartDate },
      },
    }),
    // RDV à venir au total — confirmés uniquement (hors acomptes en attente)
    prisma.booking.count({
      where: {
        ...upcomingBookingsWhere(),
        status: "CONFIRMED",
      },
    }),
    prisma.giftCard.count({
      where: { status: "ACTIVE", expiresAt: { gt: now } },
    }),
    prisma.contactMessage.count({ where: { status: "NEW" } }),
    prisma.booking.findMany({
      where: {
        ...upcomingBookingsWhere(),
        status: { in: ["CONFIRMED", "AWAITING_DEPOSIT"] },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 5,
      select: {
        id: true,
        date: true,
        startTime: true,
        status: true,
        clientFirstName: true,
        clientLastName: true,
        totalDurationMinutes: true,
        service: { select: { title: true } },
      },
    }),
    prisma.giftCard.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now, lte: thirtyDaysAhead },
      },
      orderBy: { expiresAt: "asc" },
      take: 5,
      select: {
        id: true,
        prefix: true,
        recipientName: true,
        buyerName: true,
        expiresAt: true,
        remainingAmountCents: true,
      },
    }),
    prisma.booking.findMany({
      where: {
        status: "AWAITING_DEPOSIT",
        createdAt: { lt: oneHourAgo },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: {
        id: true,
        clientFirstName: true,
        clientLastName: true,
        date: true,
        startTime: true,
      },
    }),
    // RDV passés encore CONFIRMED → à marquer honoré (ou no-show)
    prisma.booking.findMany({
      where: {
        ...pastBookingsWhere(),
        status: "CONFIRMED",
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 10,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        clientFirstName: true,
        clientLastName: true,
        totalPriceCents: true,
        service: { select: { title: true } },
      },
    }),
  ]);

  // CA mois = revenus RDV honorés + ventes de cartes cadeau (PUBLIC + ADMIN_SALE)
  // + ventes ebooks (portion Stripe uniquement, refunds déduits).
  // Les cadeaux offerts par l'admin (ADMIN_GIFT) ne sont pas comptés.
  // Pour les ebooks, la portion carte cadeau est exclue car déjà comptée
  // à la vente de la carte (sinon double-comptage).
  //
  // Pour les bookings, on additionne :
  //  - Net acompte    = depositCents − gcDeposit − stripeFee − refunded
  //                     (la portion GC ne re-compte pas, elle a déjà été comptée
  //                      à la vente initiale de la carte cadeau)
  //  - Net complément = revenueCents
  //                     (par définition, c'est déjà la portion cash/CB hors GC)
  const bookingsRevenueCents = bookingsForRevenue.reduce((sum, b) => {
    const gcDeposit = b.giftCardRedemptions
      .filter((r) => r.type === "BOOKING_DEPOSIT")
      .reduce((s, r) => s + r.amountUsedCents, 0);
    const fee = b.stripeFeeCents ?? 0;
    const refunded = b.refundedAmount ?? 0;
    const netAcompte = Math.max(0, b.depositCents - gcDeposit - fee - refunded);
    const netComplement = b.revenueCents ?? 0;
    return sum + netAcompte + netComplement;
  }, 0);
  const giftCardSalesCents = giftCardSalesAgg._sum.initialAmountCents ?? 0;
  const ebookRevenueCents = ebookSalesRaw.reduce((sum, p) => {
    const gc =
      p.giftCardRedemption && !p.giftCardRedemption.reversedAt
        ? p.giftCardRedemption.amountUsedCents
        : 0;
    const stripePortion = Math.max(0, p.amount - gc);
    const refunded = p.refundedAmount ?? 0;
    return sum + Math.max(0, stripePortion - refunded);
  }, 0);
  const revenueCents =
    bookingsRevenueCents + giftCardSalesCents + ebookRevenueCents;

  const alerts: AlertItem[] = [
    ...expiringGiftCards.map((g) => ({
      id: `gc-${g.id}`,
      severity: "warning" as const,
      title: `Carte cadeau •${g.prefix} expire bientôt`,
      context: `${g.recipientName ?? g.buyerName} · expire le ${g.expiresAt.toLocaleDateString("fr-FR")} · solde ${formatCents(g.remainingAmountCents)}`,
      href: `/admin/cartes-cadeau/${g.id}`,
    })),
    ...awaitingBookings.map((b) => ({
      id: `bk-${b.id}`,
      severity: "info" as const,
      title: "Acompte en attente depuis > 1h",
      context: `${b.clientFirstName} ${b.clientLastName} · ${formatBookingDateShort(b.date)} ${b.startTime}`,
      href: `/admin/bookings/${b.id}`,
    })),
    ...(contactsUnread > 0
      ? [{
          id: "contacts",
          severity: "info" as const,
          title: `${contactsUnread} message${contactsUnread > 1 ? "s" : ""} non lu${contactsUnread > 1 ? "s" : ""}`,
          context: "Inbox de contact",
          href: "/admin/contacts",
        }]
      : []),
  ];

  return (
    <div className="max-w-[1400px] mx-auto p-6 lg:p-8 space-y-8">
      {/* ─── Header ─── */}
      <header className="space-y-2 anim-fade-up">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Espace administration
        </p>
        <h1
          className="text-3xl md:text-4xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Bonjour <em className="text-[var(--color-violet-700)]">{userName}</em>
        </h1>
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {formatDateFr(now)}
        </p>
      </header>

      {/* ─── KPI strip ─── */}
      <section
        aria-label="Indicateurs clés"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger"
      >
        <Kpi
          label="CA du mois"
          value={<CountUp value={revenueCents} format="currency" />}
          sub={revenueCents === 0 ? "Aucun RDV honoré ce mois" : undefined}
        />
        <Kpi
          label="RDV cette semaine"
          value={<CountUp value={bookingsThisWeek} />}
          sub={`${bookingsThisMonth} ce mois · ${upcomingBookingsCount} à venir`}
        />
        <Kpi
          label="Cartes cadeau actives"
          value={<CountUp value={activeGiftCards} />}
        />
        <Kpi
          label="Messages non lus"
          value={<CountUp value={contactsUnread} />}
          tone={contactsUnread > 0 ? "warning" : "neutral"}
        />
      </section>

      {/* ─── Grille principale : prochains RDV (2/3) + alertes (1/3) ─── */}
      <section className="grid lg:grid-cols-3 gap-6">
        {/* Prochains RDV */}
        <article className="lg:col-span-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 anim-fade-up">
          <header className="flex items-end justify-between mb-4">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Agenda
              </p>
              <h2 className="text-xl" style={{ fontFamily: "var(--font-serif)" }}>
                Prochains rendez-vous
              </h2>
            </div>
            <Link
              href="/admin/calendrier"
              className="text-xs text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] underline-offset-2 hover:underline"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Voir le calendrier →
            </Link>
          </header>

          {upcomingBookings.length === 0 ? (
            <EmptyState
              text="Aucun rendez-vous à venir"
              ctaLabel="Ouvrir le calendrier"
              ctaHref="/admin/calendrier"
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {upcomingBookings.map((b) => {
                const visual = STATUS_VISUAL[b.status];
                return (
                  <li key={b.id}>
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[140px_1fr_auto_auto] items-center gap-3 py-3 hover:bg-[var(--color-violet-50)]/40 transition-colors -mx-2 px-2 rounded-[var(--radius-sm)]"
                    >
                      <div
                        className="text-sm"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        <span className="block">{formatBookingDateShort(b.date)}</span>
                        <span className="text-xs text-[var(--color-ink-500)]">
                          {b.startTime}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm text-[var(--color-ink-900)]"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {b.clientFirstName} {b.clientLastName}
                        </p>
                        <p
                          className="truncate text-xs text-[var(--color-ink-500)]"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {b.service.title} · {b.totalDurationMinutes} min
                        </p>
                      </div>
                      <span
                        className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em] ${visual.bgClass} ${visual.textClass}`}
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${visual.dotClass}`} />
                        {visual.label}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[var(--color-ink-500)]"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        {/* Alertes */}
        <aside className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 anim-fade-up">
          <header className="flex items-center justify-between mb-4">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Surveillance
              </p>
              <h2 className="text-xl" style={{ fontFamily: "var(--font-serif)" }}>
                Alertes
              </h2>
            </div>
            {alerts.length > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] text-xs"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {alerts.length}
              </span>
            )}
          </header>

          {alerts.length === 0 ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-success)]/12 text-[var(--color-success)] mb-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p
                className="text-sm text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Tout va bien
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-violet-50)]/40 transition-colors"
                  >
                    <span
                      className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${alertDotClass(a.severity)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm text-[var(--color-ink-900)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {a.title}
                      </p>
                      <p
                        className="text-xs text-[var(--color-ink-500)] mt-0.5"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {a.context}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      {/* ─── RDV passés en attente de confirmation ─── */}
      {pendingCompletion.length > 0 && (
        <section className="bg-[var(--color-paper)] border border-[var(--color-warning)]/40 rounded-[var(--radius-md)] p-6 anim-fade-up">
          <header className="flex items-end justify-between mb-4">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-warning)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                À noter
              </p>
              <h2 className="text-xl" style={{ fontFamily: "var(--font-serif)" }}>
                RDV passés à confirmer comme honorés
              </h2>
              <p
                className="text-xs text-[var(--color-ink-500)] mt-1"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Saisis le montant perçu pour incrémenter le CA du mois.
              </p>
            </div>
            <span
              className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] text-xs"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pendingCompletion.length}
            </span>
          </header>

          <ul className="divide-y divide-[var(--color-line)]">
            {pendingCompletion.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[140px_1fr_auto_auto] items-center gap-3 py-3 hover:bg-[var(--color-warning)]/5 transition-colors -mx-2 px-2 rounded-[var(--radius-sm)]"
                >
                  <div
                    className="text-sm"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    <span className="block">{formatBookingDateShort(b.date)}</span>
                    <span className="text-xs text-[var(--color-ink-500)]">
                      {b.startTime}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm text-[var(--color-ink-900)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {b.clientFirstName} {b.clientLastName}
                    </p>
                    <p
                      className="truncate text-xs text-[var(--color-ink-500)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {b.service.title} · prévu {formatCents(b.totalPriceCents)}
                    </p>
                  </div>
                  <span
                    className="hidden sm:inline-flex items-center px-3 h-7 rounded-full text-[10px] uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Marquer honoré
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[var(--color-ink-500)]"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Raccourcis ─── */}
      <section
        aria-label="Raccourcis"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger"
      >
        <QuickAction
          href="/admin/calendrier"
          title="Calendrier"
          desc="Bloquer une période · Créer un RDV"
        />
        <QuickAction
          href="/admin/parametres"
          title="Horaires & acompte"
          desc="Plages d'ouverture du salon"
        />
        <QuickAction
          href="/admin/contacts"
          title="Inbox contacts"
          desc="Messages reçus depuis le site"
        />
        <QuickAction
          href="/admin/bookings"
          title="Réservations"
          desc="Liste complète + filtres"
        />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────

type AlertSeverity = "info" | "warning" | "danger";
type AlertItem = {
  id: string;
  severity: AlertSeverity;
  title: string;
  context: string;
  href: string;
};

function alertDotClass(s: AlertSeverity): string {
  if (s === "warning") return "bg-[var(--color-warning)]";
  if (s === "danger") return "bg-[var(--color-danger)]";
  return "bg-[var(--color-violet-600)]";
}

function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "neutral" | "warning";
}) {
  const toneCls =
    tone === "warning"
      ? "text-[var(--color-warning)]"
      : "text-[var(--color-ink-900)]";
  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-violet-300)] hover:shadow-[var(--shadow-md)]">
      <p
        className={`text-3xl ${toneCls}`}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      <p
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mt-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </p>
      {sub && (
        <p
          className="text-[11px] text-[var(--color-ink-500)] mt-2"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-violet-300)] hover:shadow-[var(--shadow-md)]"
    >
      <p className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
        {title}
      </p>
      <p
        className="text-xs text-[var(--color-ink-500)] mt-1"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {desc}
      </p>
      <span
        className="inline-flex items-center gap-1 mt-3 text-xs text-[var(--color-violet-700)] transition-transform group-hover:translate-x-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Ouvrir
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </Link>
  );
}

function EmptyState({
  text,
  ctaLabel,
  ctaHref,
}: {
  text: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="text-center py-8">
      <p
        className="text-sm text-[var(--color-ink-500)] mb-3"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {text}
      </p>
      <Link
        href={ctaHref}
        className="inline-flex items-center px-4 h-9 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function isoToUtcMidnight(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addUtcDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
