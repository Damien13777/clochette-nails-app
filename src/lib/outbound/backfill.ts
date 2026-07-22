/**
 * Backfill — reconstruit les events historiques depuis les tables source et les
 * seede dans `OutboundEvent` (le worker les livre ensuite). Nécessaire car la
 * queue était log-only avant l'activation de l'ERP → sans ça l'ERP démarre vide.
 *
 * ⚠️ Miroir EXACT de finances.ts, y compris sur les redemptions de carte cadeau :
 * on ne filtre PAS sur `reversedAt` (une redemption est un événement daté, pas un
 * état courant — cf. l'en-tête de finances.ts). Toute divergence entre ce fichier
 * et finances.ts se traduirait par un écart entre le site et l'ERP.
 * ⚠️ Ce backfill a été exécuté et réconcilié au centime le 18/07. Le RELANCER
 * exige la procédure de purge complète de ce jour-là (purge outbound + incoming,
 * re-dispatch, re-projection) — sinon double comptage côté ERP.
 *
 * Modèle : compta d'ENCAISSEMENT, miroir EXACT de finances.ts (page corrigée) +
 * cycle de vie CRM complet. Un RDV génère jusqu'à 4 events (acompte, solde,
 * terminal, remboursement), chacun daté à SA date métier.
 *
 *  - `createdAt` de chaque OutboundEvent = date MÉTIER de l'event (confirmedAt /
 *    completedAt / cancelledAt / paidAt / issuedAt). Le dispatcher envoie
 *    `timestamp = createdAt` → l'ERP traite dans le bon ordre chronologique
 *    (acompte avant solde avant remboursement) et attribue le CA au bon mois Paris.
 *    Le payload porte AUSSI la date métier (confirmedAt…) → l'occurredAt du ledger
 *    est exact quelle que soit l'enveloppe.
 *  - `eventId` DÉTERMINISTE `backfill:<type>:<sourceId>` → re-run idempotent
 *    (dedup par findFirst). Un type distinct par fait → pas de collision inter-events
 *    d'un même RDV.
 *  - `before` (cutover) : ne reconstruit qu'un fait ANTÉRIEUR à la bascule live
 *    (évite le double-comptage avec l'event live du même fait, dont l'eventId diffère).
 *
 * Périmètre : bookings (confirmé/honoré/no-show/annulé/remboursé), cartes cadeau
 * vendues (PUBLIC/ADMIN_SALE, ADMIN_GIFT exclu), ebooks vendus, factures émises.
 * Hors périmètre (non-compta, projections indépendantes) : photos, contacts,
 * newsletter, catalogue services — couverts par leurs events live.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BackfillDeps = { db?: PrismaClient; before?: Date };

type RedemptionLite = { type: string; amountUsedCents: number };

function sumRedemptions(reds: RedemptionLite[], type: string): number {
  return reds
    .filter((r) => r.type === type)
    .reduce((acc, r) => acc + r.amountUsedCents, 0);
}

export async function backfillOutbound(deps: BackfillDeps = {}) {
  const db = deps.db ?? prisma;
  const beforeInput = deps.before;
  // Garde dure : sans date de cutover explicite, le filtre `occurredAt >= before`
  // retombait sur « maintenant » et ne protégeait plus rien. Un re-run
  // reconstruisait alors les faits POSTÉRIEURS à la bascule avec des eventId
  // `backfill:*` que rien ne rapproche des eventId live → double comptage ERP.
  if (!beforeInput || Number.isNaN(beforeInput.getTime())) {
    throw new Error(
      "backfillOutbound : date de cutover obligatoire (deps.before). Sans elle, un re-run double-compterait tout fait postérieur à la bascule côté ERP.",
    );
  }
  const before: Date = beforeInput;
  const targetUrl = process.env.MANAGEMENT_API_URL ?? "";
  if (!targetUrl) {
    return { seeded: 0, skipped: 0, reason: "MANAGEMENT_API_URL non configuré" };
  }

  let seeded = 0;
  let skipped = 0;

  async function seed(type: string, sourceId: string, occurredAt: Date, payload: object) {
    // Garde cutover : un fait postérieur à la bascule live a déjà émis son event
    // live (eventId distinct) → le reconstruire double-compterait.
    if (occurredAt >= before) return;
    const eventId = `backfill:${type}:${sourceId}`;
    const exists = await db.outboundEvent.findFirst({ where: { eventId }, select: { id: true } });
    if (exists) {
      skipped++;
      return;
    }
    await db.outboundEvent.create({
      data: { eventId, type, payload, targetUrl, targetService: "management", createdAt: occurredAt },
    });
    seeded++;
  }

  // ── 1. BOOKINGS — cycle de vie complet (seuls les RDV CONFIRMÉS un jour :
  //    confirmedAt non nul ; EXPIRED/AWAITING jamais confirmés = pas de fiche, pas de CA).
  const bookings = await db.booking.findMany({
    where: { confirmedAt: { not: null } },
    orderBy: { confirmedAt: "asc" },
    select: {
      id: true,
      status: true,
      confirmedAt: true,
      completedAt: true,
      cancelledAt: true,
      cancellationReason: true,
      updatedAt: true,
      depositCents: true,
      stripeFeeCents: true,
      revenueCents: true,
      completionPaymentMethod: true,
      refundedAmount: true,
      realDurationMinutes: true,
      totalDurationMinutes: true,
      paymentMethod: true,
      date: true,
      startTime: true,
      endTime: true,
      clientFirstName: true,
      clientLastName: true,
      clientEmail: true,
      clientPhone: true,
      service: { select: { slug: true, title: true } },
      giftCardRedemptions: { select: { type: true, amountUsedCents: true } },
    },
  });

  for (const b of bookings) {
    const gcDeposit = sumRedemptions(b.giftCardRedemptions, "BOOKING_DEPOSIT");
    const gcService = sumRedemptions(b.giftCardRedemptions, "BOOKING_SERVICE");
    const dateIso = b.date.toISOString().slice(0, 10);

    // ACOMPTE — encaissé à la confirmation (brut hors part GC, frais Stripe réels).
    await seed("booking.confirmed", b.id, b.confirmedAt!, {
      bookingId: b.id,
      paidVia: b.paymentMethod ?? "stripe",
      confirmedAt: b.confirmedAt!.toISOString(),
      depositCents: b.depositCents,
      giftCardAmountUsed: gcDeposit,
      stripeFeeCents: b.stripeFeeCents ?? 0,
      clientFirstName: b.clientFirstName,
      clientLastName: b.clientLastName,
      clientEmail: b.clientEmail,
      clientPhone: b.clientPhone,
      serviceSlug: b.service.slug,
      serviceTitle: b.service.title,
      date: dateIso,
      startTime: b.startTime,
      endTime: b.endTime,
    });

    // SOLDE — encaissé à l'honoré (cash/CB salon, jamais de frais Stripe).
    if (b.status === "COMPLETED" && b.completedAt) {
      await seed("booking.completed", b.id, b.completedAt, {
        bookingId: b.id,
        revenueCents: b.revenueCents ?? 0,
        completionPaymentMethod: b.completionPaymentMethod,
        giftCardAmountCents: gcService,
        realDurationMinutes: b.realDurationMinutes,
        plannedDurationMinutes: b.totalDurationMinutes,
        completedAt: b.completedAt.toISOString(),
      });
    }

    // TERMINAL CRM (pas de CA) — statut collant côté ERP.
    const terminalAt = b.cancelledAt ?? b.updatedAt;
    if (b.status === "NO_SHOW") {
      await seed("booking.no_show", b.id, terminalAt, { bookingId: b.id });
    } else if (b.status === "CANCELLED_BY_ADMIN") {
      await seed("booking.cancelled_by_admin", b.id, terminalAt, { bookingId: b.id, reason: b.cancellationReason });
    } else if (b.status === "CANCELLED_BY_CLIENT") {
      await seed("booking.cancelled_by_client", b.id, terminalAt, { bookingId: b.id });
    }

    // REMBOURSEMENT — décaissement, ligne négative à la date d'annulation.
    if ((b.refundedAmount ?? 0) > 0) {
      const refundedAt = b.cancelledAt ?? b.updatedAt;
      await seed("booking.refunded", b.id, refundedAt, {
        bookingId: b.id,
        stripeRefundedCents: b.refundedAmount ?? 0,
        gcRefundedCents: 0,
        refundedAt: refundedAt.toISOString(),
      });
    }
  }

  // ── 2. CARTES CADEAU VENDUES (PUBLIC/ADMIN_SALE PAID ; ADMIN_GIFT exclu du CA).
  const cards = await db.giftCard.findMany({
    where: { creationMode: { in: ["PUBLIC", "ADMIN_SALE"] }, paymentStatus: "PAID", paidAt: { not: null } },
    orderBy: { paidAt: "asc" },
    select: { id: true, initialAmountCents: true, stripeFeeCents: true, paidAt: true, creationMode: true, refundedAmount: true, refundedAt: true, updatedAt: true },
  });
  for (const c of cards) {
    await seed("gift_card.purchased", c.id, c.paidAt!, {
      giftCardId: c.id,
      amountCents: c.initialAmountCents,
      // ADMIN_SALE = encaissement salon (pas de frais Stripe) ; PUBLIC = Stripe.
      stripeFeeCents: c.creationMode === "PUBLIC" ? (c.stripeFeeCents ?? 0) : 0,
      channel: c.creationMode === "PUBLIC" ? "public" : "admin_sale",
      paidAt: c.paidAt!.toISOString(),
    });
    // Remboursement (décaissement daté) — miroir de la ligne « − » de finances.ts.
    if ((c.refundedAmount ?? 0) > 0) {
      const refundedAt = c.refundedAt ?? c.updatedAt;
      await seed("gift_card.refunded", c.id, refundedAt, {
        giftCardId: c.id,
        refundedAmountCents: c.refundedAmount ?? 0,
        refundedAt: refundedAt.toISOString(),
      });
    }
  }

  // ── 3. EBOOKS VENDUS (part Stripe hors GC ; la part GC est comptée à la vente de la carte).
  const ebooks = await db.ebookPurchase.findMany({
    where: { paymentStatus: { in: ["PAID", "REFUNDED"] }, paidAt: { not: null } },
    orderBy: { paidAt: "asc" },
    select: {
      id: true,
      amount: true,
      stripeFeeCents: true,
      paidAt: true,
      refundedAmount: true,
      refundedAt: true,
      updatedAt: true,
      giftCardRedemption: { select: { amountUsedCents: true } },
    },
  });
  for (const p of ebooks) {
    const gcUsed = p.giftCardRedemption?.amountUsedCents ?? 0;
    await seed("ebook.purchased", p.id, p.paidAt!, {
      purchaseId: p.id,
      amountPaidCents: Math.max(0, p.amount - gcUsed),
      stripeFeeCents: p.stripeFeeCents ?? 0,
      paidAt: p.paidAt!.toISOString(),
    });
    // Remboursement de la portion CB (décaissement daté) — miroir de finances.ts.
    if ((p.refundedAmount ?? 0) > 0) {
      const refundedAt = p.refundedAt ?? p.updatedAt;
      await seed("ebook.refunded", p.id, refundedAt, {
        purchaseId: p.id,
        stripeRefundedCents: p.refundedAmount ?? 0,
        refundedAt: refundedAt.toISOString(),
      });
    }
  }

  // ── 4. FACTURES ÉMISES (registre documentaire, HORS CA).
  const invoices = await db.invoice.findMany({
    where: { status: "ISSUED" },
    orderBy: { issuedAt: "asc" },
    select: { id: true, number: true, docType: true, sourceType: true, totalCents: true, customerEmail: true, issuedAt: true },
  });
  for (const inv of invoices) {
    await seed("invoice.issued", inv.id, inv.issuedAt, {
      invoiceId: inv.id,
      number: inv.number,
      docType: inv.docType,
      sourceType: inv.sourceType,
      totalCents: inv.totalCents,
      customerEmail: inv.customerEmail,
      issuedAt: inv.issuedAt.toISOString(),
    });
  }

  return { seeded, skipped };
}
