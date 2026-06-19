/**
 * Helpers de calcul financier pour la page /admin/finances.
 *
 * Sources de revenu (cohérent avec le dashboard) :
 *  1. Bookings COMPLETED → revenueCents (saisi par l'admin au markCompleted)
 *  2. Cartes cadeau PUBLIC/ADMIN_SALE PAID → initialAmountCents au paidAt
 *     (ADMIN_GIFT = geste commercial, exclu du CA)
 *  3. Ebooks PAID → portion Stripe uniquement (amount − giftCardUsed − refunds),
 *     pour éviter le double-comptage avec la vente initiale de la carte cadeau.
 *
 * Tout est TTC (Chloé en franchise de TVA).
 *
 * Fonctions exportées :
 *  - computeFinances(from, to) : agrégats + liste transactions sur la période
 *  - computeDailySeries(from, to) : série quotidienne pour graphique
 *  - buildTransactionsCsv(transactions) : CSV journal de caisse
 */

import { prisma } from "@/lib/prisma";

export type TransactionType = "booking" | "gift_card" | "ebook";

export type FinanceTransaction = {
  id: string; // ID unique (préfixé par type)
  type: TransactionType;
  dateIso: string; // date qui sert au regroupement (paidAt / completedAt)
  ref: string; // ref métier (ID booking court, prefix carte, slug ebook…)
  /** URL admin de détail de la transaction (cliquable depuis la table) */
  detailUrl: string;
  clientName: string;
  clientEmail: string;
  paymentMethod: string; // "stripe" | "gift_card_full" | "cash" | ...
  grossCents: number; // brut (avant refunds + frais)
  giftCardUsedCents: number; // portion couverte par carte cadeau
  stripeFeeCents: number; // frais Stripe (peut être null → 0)
  refundedCents: number; // remboursé
  netCents: number; // ce qui rentre vraiment au CA (gross − giftCardUsed − refunded − stripeFee)
};

export type FinanceTotals = {
  grossCents: number;
  giftCardUsedCents: number;
  stripeFeeCents: number;
  refundedCents: number;
  netCents: number;
  count: number;
  averageGrossCents: number;
};

export type FinanceBreakdown = {
  bookings: FinanceTotals;
  giftCards: FinanceTotals;
  ebooks: FinanceTotals;
};

export type FinanceResult = {
  totals: FinanceTotals;
  breakdown: FinanceBreakdown;
  transactions: FinanceTransaction[];
};

// ─── Compute principal ──────────────────────────────────────

export async function computeFinances(
  from: Date,
  to: Date,
): Promise<FinanceResult> {
  const [bookingTxs, giftCardTxs, ebookTxs] = await Promise.all([
    loadBookingTransactions(from, to),
    loadGiftCardTransactions(from, to),
    loadEbookTransactions(from, to),
  ]);

  const all = [...bookingTxs, ...giftCardTxs, ...ebookTxs].sort((a, b) =>
    b.dateIso.localeCompare(a.dateIso),
  );

  const totals = sumTotals(all);
  const breakdown: FinanceBreakdown = {
    bookings: sumTotals(bookingTxs),
    giftCards: sumTotals(giftCardTxs),
    ebooks: sumTotals(ebookTxs),
  };

  return { totals, breakdown, transactions: all };
}

// ─── Loaders par source ────────────────────────────────────

/**
 * Charge les transactions issues des bookings. Chaque RDV COMPLETED génère
 * jusqu'à 2 lignes financières distinctes :
 *  1. **Acompte** (au confirmedAt) — payé Stripe ou couvert par carte cadeau
 *     au moment de la résa. Frais Stripe (sur acompte) inclus ici.
 *  2. **Complément** (au completedAt) — payé en salon (espèces, CB terminal,
 *     virement, chèque, carte cadeau service…) au moment du markCompleted.
 *     Affiché uniquement si revenueCents > depositCents (sinon le RDV n'a
 *     pas eu de complément à régler).
 *
 * Filtre : on prend les RDV dont **soit l'acompte soit le complément**
 * tombe dans [from, to[. On filtre ensuite finement côté code.
 */
async function loadBookingTransactions(
  from: Date,
  to: Date,
): Promise<FinanceTransaction[]> {
  const bookings = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      // RDV où soit l'acompte (confirmedAt) soit le complément (completedAt)
      // tombe dans la période
      OR: [
        { confirmedAt: { gte: from, lt: to } },
        { completedAt: { gte: from, lt: to } },
      ],
    },
    select: {
      id: true,
      revenueCents: true,
      depositCents: true,
      stripeFeeCents: true,
      refundedAmount: true,
      paymentMethod: true,
      completionPaymentMethod: true,
      clientFirstName: true,
      clientLastName: true,
      clientEmail: true,
      confirmedAt: true,
      completedAt: true,
      service: { select: { title: true } },
      giftCardRedemptions: {
        where: { reversedAt: null },
        select: { amountUsedCents: true, type: true },
      },
    },
  });

  const out: FinanceTransaction[] = [];
  for (const b of bookings) {
    const clientName = `${b.clientFirstName} ${b.clientLastName}`.trim();
    const refShort = b.id.slice(0, 8);
    const detailUrl = `/admin/bookings/${b.id}`;

    // Split des gift card redemptions par type
    const gcDeposit = b.giftCardRedemptions
      .filter((r) => r.type === "BOOKING_DEPOSIT")
      .reduce((s, r) => s + r.amountUsedCents, 0);
    const gcService = b.giftCardRedemptions
      .filter((r) => r.type === "BOOKING_SERVICE")
      .reduce((s, r) => s + r.amountUsedCents, 0);

    // ─── Ligne 1 : ACOMPTE ────────────────────────────
    if (b.confirmedAt && b.confirmedAt >= from && b.confirmedAt < to) {
      const depositGross = b.depositCents;
      const fee = b.stripeFeeCents ?? 0;
      const refunded = b.refundedAmount ?? 0;
      const netAcompte = Math.max(0, depositGross - gcDeposit - fee - refunded);
      // Mode acompte : si toute la portion non-GC reste à payer Stripe = "stripe",
      // sinon si totalement couvert par GC = "gift_card_full"
      const stripePortion = Math.max(0, depositGross - gcDeposit);
      const acompteMode = stripePortion === 0 ? "gift_card_full" : "stripe";
      out.push({
        id: `booking-deposit:${b.id}`,
        type: "booking",
        dateIso: b.confirmedAt.toISOString(),
        ref: `${refShort} · acompte`,
        detailUrl,
        clientName,
        clientEmail: b.clientEmail,
        paymentMethod: acompteMode,
        grossCents: depositGross,
        giftCardUsedCents: gcDeposit,
        stripeFeeCents: fee,
        refundedCents: refunded,
        netCents: netAcompte,
      });
    }

    // ─── Ligne 2 : COMPLÉMENT (si applicable) ─────────
    // revenueCents (cf. markBookingCompleted) = portion cash/CB/chèque/virement
    // perçue au markCompleted, HORS carte cadeau. C'est ce qui rentre au CA en
    // plus de l'acompte. Donc :
    //  - brut complément = revenueCents (cash etc.) + gcService (carte cadeau)
    //  - net CA          = revenueCents (la GC ne re-compte pas, déjà comptée
    //                      à la vente initiale de la carte)
    const revenueCash = b.revenueCents ?? 0;
    const complementGross = revenueCash + gcService;
    const completedAtInRange =
      b.completedAt && b.completedAt >= from && b.completedAt < to;
    if (completedAtInRange && complementGross > 0) {
      // Mode affichage : si revenueCash > 0, mode = completionPaymentMethod
      // (cash, terminal, etc.). Sinon (100% GC), mode = "gift_card_full".
      const complementMode =
        revenueCash === 0 && gcService > 0
          ? "gift_card_full"
          : (b.completionPaymentMethod ?? "—");
      out.push({
        id: `booking-completion:${b.id}`,
        type: "booking",
        dateIso: b.completedAt!.toISOString(),
        ref: `${refShort} · complément`,
        detailUrl,
        clientName,
        clientEmail: b.clientEmail,
        paymentMethod: complementMode,
        grossCents: complementGross,
        giftCardUsedCents: gcService,
        stripeFeeCents: 0,
        refundedCents: 0,
        netCents: revenueCash,
      });
    }
  }
  return out;
}

async function loadGiftCardTransactions(
  from: Date,
  to: Date,
): Promise<FinanceTransaction[]> {
  const cards = await prisma.giftCard.findMany({
    where: {
      creationMode: { in: ["PUBLIC", "ADMIN_SALE"] },
      paymentStatus: "PAID",
      paidAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      prefix: true,
      initialAmountCents: true,
      stripeFeeCents: true,
      refundedAmount: true,
      buyerName: true,
      buyerEmail: true,
      paidAt: true,
      creationMode: true,
    },
  });

  return cards.map((c) => {
    const gross = c.initialAmountCents;
    // Vente en salon (ADMIN_SALE) = paiement physique, pas de frais Stripe.
    // Vente publique (PUBLIC) = Stripe Checkout, frais réels via webhook.
    const fee = c.creationMode === "PUBLIC" ? (c.stripeFeeCents ?? 0) : 0;
    // Remboursement (refundGiftCardStripe pose status=REFUNDED + refundedAmount,
    // mais garde paymentStatus=PAID → la carte reste comptée ici, on déduit le refund).
    const refunded = c.refundedAmount ?? 0;
    return {
      id: `giftcard:${c.id}`,
      type: "gift_card" as TransactionType,
      dateIso: (c.paidAt ?? new Date()).toISOString(),
      ref: `•${c.prefix}`,
      detailUrl: `/admin/cartes-cadeau/${c.id}`,
      clientName: c.buyerName,
      clientEmail: c.buyerEmail,
      paymentMethod: c.creationMode === "ADMIN_SALE" ? "salon" : "stripe",
      grossCents: gross,
      giftCardUsedCents: 0,
      stripeFeeCents: fee,
      refundedCents: refunded,
      netCents: Math.max(0, gross - fee - refunded),
    };
  });
}

async function loadEbookTransactions(
  from: Date,
  to: Date,
): Promise<FinanceTransaction[]> {
  const purchases = await prisma.ebookPurchase.findMany({
    where: {
      paymentStatus: { in: ["PAID", "REFUNDED"] },
      paidAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      amount: true,
      refundedAmount: true,
      stripeFeeCents: true,
      paidAt: true,
      clientName: true,
      clientEmail: true,
      ebook: { select: { slug: true, title: true } },
      giftCardRedemption: {
        select: { amountUsedCents: true, reversedAt: true },
      },
    },
  });

  return purchases.map((p) => {
    const gross = p.amount;
    const gcUsed =
      p.giftCardRedemption && !p.giftCardRedemption.reversedAt
        ? p.giftCardRedemption.amountUsedCents
        : 0;
    const fee = p.stripeFeeCents ?? 0;
    const refunded = p.refundedAmount ?? 0;
    // Net = portion Stripe nette (la portion GC est exclue du CA pour éviter
    // double-comptage avec la vente initiale de la carte)
    const net = Math.max(0, gross - gcUsed - refunded - fee);
    return {
      id: `ebook:${p.id}`,
      type: "ebook" as TransactionType,
      dateIso: (p.paidAt ?? new Date()).toISOString(),
      ref: p.ebook.slug,
      detailUrl: `/admin/ebooks/ventes/${p.id}`,
      clientName: p.clientName ?? p.clientEmail,
      clientEmail: p.clientEmail,
      paymentMethod: gcUsed >= gross ? "gift_card_full" : "stripe",
      grossCents: gross,
      giftCardUsedCents: gcUsed,
      stripeFeeCents: fee,
      refundedCents: refunded,
      netCents: net,
    };
  });
}

// ─── Agrégation ────────────────────────────────────────────

function sumTotals(txs: FinanceTransaction[]): FinanceTotals {
  const t = txs.reduce(
    (acc, x) => ({
      grossCents: acc.grossCents + x.grossCents,
      giftCardUsedCents: acc.giftCardUsedCents + x.giftCardUsedCents,
      stripeFeeCents: acc.stripeFeeCents + x.stripeFeeCents,
      refundedCents: acc.refundedCents + x.refundedCents,
      netCents: acc.netCents + x.netCents,
    }),
    {
      grossCents: 0,
      giftCardUsedCents: 0,
      stripeFeeCents: 0,
      refundedCents: 0,
      netCents: 0,
    },
  );
  return {
    ...t,
    count: txs.length,
    averageGrossCents: txs.length > 0 ? Math.round(t.grossCents / txs.length) : 0,
  };
}

// ─── Série temporelle pour graphique ───────────────────────

export type DailySeriesPoint = {
  dateIso: string; // "2026-05-21"
  netCents: number;
  grossCents: number;
  count: number;
};

/**
 * Renvoie une série quotidienne sur [from, to[ avec 1 point par jour (même
 * si 0). Si la période > 60 jours, le caller peut agréger côté UI en mois.
 */
export async function computeDailySeries(
  from: Date,
  to: Date,
): Promise<DailySeriesPoint[]> {
  const { transactions } = await computeFinances(from, to);
  const map = new Map<string, DailySeriesPoint>();

  // Initialise tous les jours à 0
  const cur = new Date(from);
  while (cur < to) {
    const key = isoDateOnly(cur);
    map.set(key, { dateIso: key, netCents: 0, grossCents: 0, count: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  for (const tx of transactions) {
    const key = isoDateOnly(new Date(tx.dateIso));
    const p = map.get(key);
    if (!p) continue;
    p.netCents += tx.netCents;
    p.grossCents += tx.grossCents;
    p.count += 1;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso),
  );
}

function isoDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ─── Export CSV ────────────────────────────────────────────

export function buildTransactionsCsv(txs: FinanceTransaction[]): string {
  const header = [
    "Date",
    "Type",
    "Référence",
    "Client",
    "Email",
    "Mode paiement",
    "Brut (€)",
    "Carte cadeau (€)",
    "Frais Stripe (€)",
    "Remboursé (€)",
    "Net (€)",
  ].join(";");

  const lines = txs.map((t) => {
    const d = new Date(t.dateIso);
    const dateStr = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    return [
      dateStr,
      labelType(t.type),
      esc(t.ref),
      esc(t.clientName),
      esc(t.clientEmail),
      esc(t.paymentMethod),
      euroNumber(t.grossCents),
      euroNumber(t.giftCardUsedCents),
      euroNumber(t.stripeFeeCents),
      euroNumber(t.refundedCents),
      euroNumber(t.netCents),
    ].join(";");
  });

  // BOM UTF-8 pour Excel (sinon accents cassés)
  return "﻿" + [header, ...lines].join("\n");
}

function esc(s: string): string {
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function euroNumber(cents: number): string {
  // Format français : virgule comme séparateur décimal
  return (cents / 100).toFixed(2).replace(".", ",");
}

function labelType(t: TransactionType): string {
  return t === "booking" ? "RDV" : t === "gift_card" ? "Carte cadeau" : "Ebook";
}

// ─── Analytics par card (pour les modales expand) ──────────

export type TopItem = {
  title: string;
  slug?: string;
  count: number;
  netCents: number;
  grossCents: number;
};

export type WeekdayStats = {
  weekday: number; // 1 = lundi … 7 = dimanche (ISO)
  label: string;
  count: number;
  totalCents: number;
};

export type MonthStats = {
  month: number; // 1 = janvier … 12 = décembre
  label: string;
  count: number;
  totalCents: number;
};

export type SeasonStats = {
  /** "spring" | "summer" | "autumn" | "winter" */
  season: "spring" | "summer" | "autumn" | "winter";
  label: string;
  /** Mois inclus (1-12) à titre indicatif */
  months: number[];
  count: number;
  totalCents: number;
};

export type FinanceAnalytics = {
  /** Top prestations vendues sur la période (bookings COMPLETED) */
  topServices: TopItem[];
  /** Top ebooks vendus sur la période (par CA net puis count) */
  topEbooks: TopItem[];
  /** Distribution des achats de cartes cadeau par jour de semaine */
  giftCardWeekdayDistribution: WeekdayStats[];
  /** Distribution des achats de cartes cadeau par mois (1-12) */
  giftCardMonthlyDistribution: MonthStats[];
  /** Distribution des achats de cartes cadeau par saison */
  giftCardSeasonalDistribution: SeasonStats[];
};

export async function computeFinanceAnalytics(
  from: Date,
  to: Date,
): Promise<FinanceAnalytics> {
  const [topServices, topEbooks, giftCards] = await Promise.all([
    loadTopServices(from, to),
    loadTopEbooks(from, to),
    loadGiftCardsForWeekdayStats(from, to),
  ]);

  return {
    topServices,
    topEbooks,
    giftCardWeekdayDistribution: computeWeekdayDistribution(giftCards),
    giftCardMonthlyDistribution: computeMonthlyDistribution(giftCards),
    giftCardSeasonalDistribution: computeSeasonalDistribution(giftCards),
  };
}

async function loadTopServices(from: Date, to: Date): Promise<TopItem[]> {
  const bookings = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: from, lt: to },
    },
    select: {
      depositCents: true,
      revenueCents: true,
      stripeFeeCents: true,
      refundedAmount: true,
      service: { select: { title: true, slug: true } },
      giftCardRedemptions: {
        where: { reversedAt: null },
        select: { amountUsedCents: true, type: true },
      },
    },
  });

  const agg = new Map<string, TopItem>();
  for (const b of bookings) {
    const key = b.service.slug;
    const existing = agg.get(key) ?? {
      title: b.service.title,
      slug: b.service.slug,
      count: 0,
      netCents: 0,
      grossCents: 0,
    };
    // Split GC par type (cohérent avec loadBookingTransactions)
    const gcDeposit = b.giftCardRedemptions
      .filter((r) => r.type === "BOOKING_DEPOSIT")
      .reduce((s, r) => s + r.amountUsedCents, 0);
    const gcService = b.giftCardRedemptions
      .filter((r) => r.type === "BOOKING_SERVICE")
      .reduce((s, r) => s + r.amountUsedCents, 0);
    const fee = b.stripeFeeCents ?? 0;
    const refunded = b.refundedAmount ?? 0;
    const revenueCash = b.revenueCents ?? 0;

    // Brut total du RDV : tout ce qui a été encaissé (Stripe acompte + GC acompte
    // + cash/CB complément + GC complément)
    const gross = b.depositCents + revenueCash + gcService;
    // Net qui rentre au CA pour CE RDV :
    //   net acompte = depositCents − gcDeposit − fee − refunded
    //   net complément = revenueCash (la GC ne re-compte pas)
    const netAcompte = Math.max(0, b.depositCents - gcDeposit - fee - refunded);
    const net = netAcompte + revenueCash;

    existing.count += 1;
    existing.grossCents += gross;
    existing.netCents += net;
    agg.set(key, existing);
  }

  return Array.from(agg.values())
    .sort((a, b) => b.netCents - a.netCents || b.count - a.count)
    .slice(0, 10);
}

async function loadTopEbooks(from: Date, to: Date): Promise<TopItem[]> {
  const purchases = await prisma.ebookPurchase.findMany({
    where: {
      paymentStatus: { in: ["PAID", "REFUNDED"] },
      paidAt: { gte: from, lt: to },
    },
    select: {
      amount: true,
      refundedAmount: true,
      stripeFeeCents: true,
      ebook: { select: { title: true, slug: true } },
      giftCardRedemption: {
        select: { amountUsedCents: true, reversedAt: true },
      },
    },
  });

  const agg = new Map<string, TopItem>();
  for (const p of purchases) {
    const key = p.ebook.slug;
    const existing = agg.get(key) ?? {
      title: p.ebook.title,
      slug: p.ebook.slug,
      count: 0,
      netCents: 0,
      grossCents: 0,
    };
    const gcUsed =
      p.giftCardRedemption && !p.giftCardRedemption.reversedAt
        ? p.giftCardRedemption.amountUsedCents
        : 0;
    const fee = p.stripeFeeCents ?? 0;
    const refunded = p.refundedAmount ?? 0;
    existing.count += 1;
    existing.grossCents += p.amount;
    existing.netCents += Math.max(0, p.amount - gcUsed - refunded - fee);
    agg.set(key, existing);
  }

  return Array.from(agg.values())
    .sort((a, b) => b.netCents - a.netCents || b.count - a.count)
    .slice(0, 10);
}

async function loadGiftCardsForWeekdayStats(
  from: Date,
  to: Date,
): Promise<Array<{ paidAt: Date | null; initialAmountCents: number }>> {
  return prisma.giftCard.findMany({
    where: {
      creationMode: { in: ["PUBLIC", "ADMIN_SALE"] },
      paymentStatus: "PAID",
      paidAt: { gte: from, lt: to },
    },
    select: { paidAt: true, initialAmountCents: true },
  });
}

function computeWeekdayDistribution(
  cards: Array<{ paidAt: Date | null; initialAmountCents: number }>,
): WeekdayStats[] {
  // Init lundi → dimanche
  const days: WeekdayStats[] = [
    { weekday: 1, label: "Lundi", count: 0, totalCents: 0 },
    { weekday: 2, label: "Mardi", count: 0, totalCents: 0 },
    { weekday: 3, label: "Mercredi", count: 0, totalCents: 0 },
    { weekday: 4, label: "Jeudi", count: 0, totalCents: 0 },
    { weekday: 5, label: "Vendredi", count: 0, totalCents: 0 },
    { weekday: 6, label: "Samedi", count: 0, totalCents: 0 },
    { weekday: 7, label: "Dimanche", count: 0, totalCents: 0 },
  ];
  for (const c of cards) {
    if (!c.paidAt) continue;
    // getDay() : 0=dim, 1=lun … 6=sam. On convertit en ISO (1=lun … 7=dim).
    const isoWeekday = c.paidAt.getUTCDay() === 0 ? 7 : c.paidAt.getUTCDay();
    const slot = days[isoWeekday - 1];
    if (!slot) continue;
    slot.count += 1;
    slot.totalCents += c.initialAmountCents;
  }
  return days;
}

function computeMonthlyDistribution(
  cards: Array<{ paidAt: Date | null; initialAmountCents: number }>,
): MonthStats[] {
  const labels = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  const months: MonthStats[] = labels.map((label, i) => ({
    month: i + 1,
    label,
    count: 0,
    totalCents: 0,
  }));
  for (const c of cards) {
    if (!c.paidAt) continue;
    const idx = c.paidAt.getUTCMonth(); // 0-11
    const slot = months[idx];
    if (!slot) continue;
    slot.count += 1;
    slot.totalCents += c.initialAmountCents;
  }
  return months;
}

/**
 * Saisons météorologiques européennes :
 *  - Printemps : mars, avril, mai
 *  - Été       : juin, juillet, août
 *  - Automne   : septembre, octobre, novembre
 *  - Hiver     : décembre, janvier, février
 */
function computeSeasonalDistribution(
  cards: Array<{ paidAt: Date | null; initialAmountCents: number }>,
): SeasonStats[] {
  const seasons: SeasonStats[] = [
    { season: "spring", label: "Printemps", months: [3, 4, 5], count: 0, totalCents: 0 },
    { season: "summer", label: "Été", months: [6, 7, 8], count: 0, totalCents: 0 },
    { season: "autumn", label: "Automne", months: [9, 10, 11], count: 0, totalCents: 0 },
    { season: "winter", label: "Hiver", months: [12, 1, 2], count: 0, totalCents: 0 },
  ];
  function seasonIndexFromMonth(m1to12: number): number {
    if (m1to12 >= 3 && m1to12 <= 5) return 0; // printemps
    if (m1to12 >= 6 && m1to12 <= 8) return 1; // été
    if (m1to12 >= 9 && m1to12 <= 11) return 2; // automne
    return 3; // hiver (déc, jan, fév)
  }
  for (const c of cards) {
    if (!c.paidAt) continue;
    const m = c.paidAt.getUTCMonth() + 1; // 1-12
    const slot = seasons[seasonIndexFromMonth(m)];
    if (!slot) continue;
    slot.count += 1;
    slot.totalCents += c.initialAmountCents;
  }
  return seasons;
}
