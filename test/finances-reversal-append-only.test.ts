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
import { computeFinances } from "@/lib/finances";

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
});
