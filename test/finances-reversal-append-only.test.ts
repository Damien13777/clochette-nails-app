/**
 * Append-only : annuler une redemption de carte cadeau ne doit RIEN changer à un
 * mois déjà arrêté.
 *
 * Une redemption est un événement DATÉ (redeemedAt), pas un état courant. La
 * compta la lisait via `where: { reversedAt: null }`, c'est-à-dire comme une
 * gomme : le jour où l'admin rembourse un RDV réglé en carte cadeau, la
 * redemption disparaît des calculs et le net d'un mois clos remonte
 * rétroactivement.
 *
 * Économiquement, restituer une carte cadeau n'est pas une sortie d'argent :
 * c'est un re-crédit de dette. La vente de la carte a déjà été comptée au CA à
 * sa date. Il n'y a donc AUCUNE ligne à produire — juste un passé à ne pas
 * réécrire.
 *
 * L'import de ../e2e/db doit précéder celui de @/lib/finances (chargement de
 * .env.test avant que le client Prisma ne lise DATABASE_URL).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import { computeFinanceAnalytics, computeFinances } from "@/lib/finances";

const JUILLET = {
  from: new Date("2026-06-30T22:00:00.000Z"),
  to: new Date("2026-07-31T22:00:00.000Z"),
};

async function makeCard(amountCents: number) {
  return db.giftCard.create({
    data: {
      code: `GC-${randomUUID().slice(0, 8)}`,
      codeHash: `hash-${randomUUID()}`,
      prefix: "AB12",
      initialAmountCents: amountCents,
      remainingAmountCents: 0,
      amount: amountCents,
      deliveryMode: "EMAIL_TO_BUYER",
      buyerName: "Marraine",
      buyerEmail: "marraine@test.local",
      creationMode: "ADMIN_GIFT",
      paymentStatus: "PAID",
      status: "FULLY_USED",
      expiresAt: new Date("2027-07-01T00:00:00.000Z"),
    },
  });
}

/** RDV confirmé en juillet dont l'acompte est réglé à 100 % en carte cadeau. */
async function makeBookingPaidByGiftCard(depositCents: number) {
  const service = await db.service.create({
    data: {
      slug: `svc-${randomUUID().slice(0, 8)}`,
      title: "Pose gel",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 90,
      priceCents: 6500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
  const booking = await db.booking.create({
    data: {
      date: new Date("2026-08-20"),
      startTime: "10:00",
      endTime: "11:30",
      serviceId: service.id,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: `jean-${randomUUID().slice(0, 8)}@test.local`,
      clientPhone: "0600000000",
      totalDurationMinutes: 90,
      totalPriceCents: 6500,
      depositCents,
      status: "CONFIRMED",
      confirmedAt: new Date("2026-07-17T09:00:00.000Z"),
      paymentMethod: "gift_card_full",
    },
  });
  const card = await makeCard(depositCents);
  const redemption = await db.giftCardRedemption.create({
    data: {
      giftCardId: card.id,
      bookingId: booking.id,
      type: "BOOKING_DEPOSIT",
      amountUsedCents: depositCents,
      redeemedByEmail: "cliente@test.local",
      redeemedAt: new Date("2026-07-17T09:00:00.000Z"),
    },
  });
  return { booking, redemption };
}

beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("append-only — un reversal de carte cadeau ne réécrit pas le passé", () => {
  it("laisse la ligne d'acompte de juillet intacte après annulation de la redemption", async () => {
    const { redemption } = await makeBookingPaidByGiftCard(1350);

    const avant = await computeFinances(JUILLET.from, JUILLET.to);
    expect(avant.totals.grossCents).toBe(1350);
    expect(avant.totals.giftCardUsedCents).toBe(1350);
    expect(avant.totals.netCents).toBe(0); // rien d'encaissé : la carte était déjà du CA

    // L'admin rembourse le RDV : la part carte cadeau est re-créditée à la cliente.
    await db.giftCardRedemption.update({
      where: { id: redemption.id },
      data: {
        reversedAt: new Date("2026-07-25T10:00:00.000Z"),
        reversedAmountCents: 1350,
      },
    });

    const apres = await computeFinances(JUILLET.from, JUILLET.to);
    expect(apres.totals.grossCents).toBe(1350);
    expect(apres.totals.giftCardUsedCents).toBe(1350);
    expect(apres.totals.netCents).toBe(0); // et surtout PAS 1350
  });

  it("laisse la ligne intacte même si le reversal est PARTIEL", async () => {
    const { redemption } = await makeBookingPaidByGiftCard(4000);

    await db.giftCardRedemption.update({
      where: { id: redemption.id },
      data: {
        reversedAt: new Date("2026-07-25T10:00:00.000Z"),
        reversedAmountCents: 1000,
      },
    });

    const apres = await computeFinances(JUILLET.from, JUILLET.to);
    expect(apres.totals.giftCardUsedCents).toBe(4000);
    expect(apres.totals.netCents).toBe(0);
  });

  it("laisse le complément d'un RDV honoré intact quand la carte cadeau du SERVICE est reversée", async () => {
    // Cas métier le plus probable : Chloé encaisse la carte cadeau au moment du
    // « marquer honoré », puis rembourse le RDV plus tard.
    const service = await db.service.create({
      data: {
        slug: `svc-${randomUUID().slice(0, 8)}`,
        title: "Pose gel",
        shortDesc: "d",
        description: "d",
        category: "SOIN_MAINS",
        durationMinutes: 90,
        priceCents: 6500,
        displayOrder: 1,
        status: "PUBLISHED",
      },
    });
    const booking = await db.booking.create({
      data: {
        date: new Date("2026-07-10"),
        startTime: "10:00",
        endTime: "11:30",
        serviceId: service.id,
        clientFirstName: "Jean",
        clientLastName: "Dupont",
        clientEmail: `jean-${randomUUID().slice(0, 8)}@test.local`,
        clientPhone: "0600000000",
        totalDurationMinutes: 90,
        totalPriceCents: 6500,
        depositCents: 3500,
        revenueCents: 0,
        status: "COMPLETED",
        confirmedAt: new Date("2026-07-02T09:00:00.000Z"),
        completedAt: new Date("2026-07-10T14:00:00.000Z"),
      },
    });
    const card = await makeCard(3000);
    const redemption = await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        bookingId: booking.id,
        type: "BOOKING_SERVICE",
        amountUsedCents: 3000,
        redeemedByEmail: "cliente@test.local",
        redeemedAt: new Date("2026-07-10T14:00:00.000Z"),
      },
    });

    const avant = await computeFinances(JUILLET.from, JUILLET.to);
    expect(avant.totals.grossCents).toBe(6500); // acompte 35 € + complément 30 €
    expect(avant.totals.count).toBe(1); // 1 RDV honoré
    expect(avant.totals.averageGrossCents).toBe(6500);

    await db.giftCardRedemption.update({
      where: { id: redemption.id },
      data: {
        reversedAt: new Date("2026-09-05T10:00:00.000Z"),
        reversedAmountCents: 3000,
      },
    });

    const apres = await computeFinances(JUILLET.from, JUILLET.to);
    // Sans le correctif : la ligne de complément disparaîtrait entièrement
    // (30 € de brut évaporés) et le ticket moyen tomberait à 35 €.
    expect(apres.totals.grossCents).toBe(6500);
    expect(apres.totals.count).toBe(1);
    expect(apres.totals.averageGrossCents).toBe(6500);

    // Le « Top prestations » de la modale d'analyse lit une requête distincte :
    // il doit rester figé lui aussi, sinon deux écrans se contredisent.
    const analytics = await computeFinanceAnalytics(JUILLET.from, JUILLET.to);
    expect(analytics.topServices[0]?.grossCents).toBe(6500);
  });

  it("laisse le net d'un ebook réglé 100 % en carte cadeau à 0 après reversal", async () => {
    const ebook = await db.ebook.create({
      data: {
        slug: `ebook-${randomUUID().slice(0, 8)}`,
        title: "Guide nail art",
        shortDesc: "d",
        description: "d",
        priceCents: 1900,
        status: "PUBLISHED",
      },
    });
    const purchase = await db.ebookPurchase.create({
      data: {
        ebookId: ebook.id,
        clientEmail: `cliente-${randomUUID().slice(0, 8)}@test.local`,
        amount: 1900,
        paymentStatus: "PAID",
        paidAt: new Date("2026-07-06T10:00:00.000Z"),
        downloadToken: randomUUID().replace(/-/g, ""),
        tokenExpiresAt: new Date("2026-08-06T10:00:00.000Z"),
      },
    });
    const card = await makeCard(1900);
    const redemption = await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        ebookPurchaseId: purchase.id,
        type: "EBOOK",
        amountUsedCents: 1900,
        redeemedByEmail: "cliente@test.local",
        redeemedAt: new Date("2026-07-06T10:00:00.000Z"),
      },
    });

    const avant = await computeFinances(JUILLET.from, JUILLET.to);
    expect(avant.totals.netCents).toBe(0); // déjà compté au CA à la vente de la carte

    await db.giftCardRedemption.update({
      where: { id: redemption.id },
      data: {
        reversedAt: new Date("2026-07-20T10:00:00.000Z"),
        reversedAmountCents: 1900,
      },
    });

    const apres = await computeFinances(JUILLET.from, JUILLET.to);
    // Sans le correctif : juillet gagnerait 19,00 € de net sorti de nulle part
    // (aucun refund Stripe possible : la vente n'a jamais eu de paiement Stripe).
    expect(apres.totals.netCents).toBe(0);

    // Le « Top ebooks » de la modale d'analyse lit sa propre requête.
    const analytics = await computeFinanceAnalytics(JUILLET.from, JUILLET.to);
    expect(analytics.topEbooks[0]?.netCents).toBe(0);
  });
});
