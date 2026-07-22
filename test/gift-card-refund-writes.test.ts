/**
 * refundGiftCardStripe — écriture du remboursement.
 *
 * Vérifie que le remboursement d'une carte cadeau :
 *  - pose refundedAt (la date qui permettra à la compta de placer la ligne
 *    négative au bon mois) ET refundedAmount ;
 *  - laisse paymentStatus à PAID (invariant D5 : le CA brut de la vente ne bouge
 *    pas) ; status passe à REFUNDED ;
 *  - émet gift_card.refunded avec refundedAt dans le payload ;
 *  - n'écrit RIEN si le remboursement Stripe n'a pas réussi (garde refund.status).
 *
 * e2e/db charge .env.test avant que @/lib/prisma ne lise DATABASE_URL.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";

vi.mock("@/lib/auth-guards", () => ({
  requireAdmin: vi.fn(),
  requireAdminUserId: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "t" }) }));
vi.mock("@/lib/outbound-events", () => ({ emitOutboundEvent: vi.fn() }));
vi.mock("@/lib/invoice/create-invoice", () => ({
  createCreditNote: vi.fn().mockResolvedValue({ id: "cn1", number: "AV-TEST" }),
  createInvoiceForGiftCard: vi.fn(),
  InvoiceError: class extends Error {},
}));
vi.mock("@/lib/invoice/invoice-email", () => ({ sendInvoiceEmail: vi.fn() }));

const refundsCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: { refunds: { create: (...a: unknown[]) => refundsCreate(...a) } } }));

import { requireAdmin } from "@/lib/auth-guards";
import { emitOutboundEvent } from "@/lib/outbound-events";
import {
  refundGiftCardOffline,
  refundGiftCardStripe,
} from "@/lib/actions/gift-card-admin";

async function makeAdmin() {
  const rand = randomUUID().slice(0, 8);
  const admin = await db.user.create({ data: { email: `admin-${rand}@test.local`, role: "ADMIN" } });
  vi.mocked(requireAdmin).mockResolvedValue({ id: admin.id, email: admin.email });
  return admin;
}

async function makeSalonCard(amountCents: number, used = 0) {
  return db.giftCard.create({
    data: {
      code: `GC-${randomUUID().slice(0, 8)}`,
      codeHash: `hash-${randomUUID()}`,
      prefix: "SA12",
      initialAmountCents: amountCents,
      remainingAmountCents: amountCents - used,
      amount: amountCents,
      deliveryMode: "EMAIL_TO_BUYER",
      buyerName: "Cliente Salon",
      buyerEmail: "salon@test.local",
      creationMode: "ADMIN_SALE", // vendue au comptoir, aucun paiement Stripe
      paymentStatus: "PAID",
      paymentMethod: "cash",
      status: used > 0 ? "PARTIALLY_USED" : "ACTIVE",
      paidAt: new Date("2026-05-02T10:00:00.000Z"),
      expiresAt: new Date("2027-05-02T10:00:00.000Z"),
    },
  });
}

async function makePublicCard(amountCents: number) {
  return db.giftCard.create({
    data: {
      code: `GC-${randomUUID().slice(0, 8)}`,
      codeHash: `hash-${randomUUID()}`,
      prefix: "AB12",
      initialAmountCents: amountCents,
      remainingAmountCents: amountCents,
      amount: amountCents,
      deliveryMode: "EMAIL_TO_BUYER",
      buyerName: "Acheteuse",
      buyerEmail: "acheteuse@test.local",
      creationMode: "PUBLIC",
      paymentStatus: "PAID",
      status: "ACTIVE",
      stripePaymentId: `pi_${randomUUID().slice(0, 12)}`,
      paidAt: new Date("2026-05-02T10:00:00.000Z"),
      expiresAt: new Date("2027-05-02T10:00:00.000Z"),
    },
  });
}

beforeEach(async () => {
  await truncateAll();
  refundsCreate.mockReset();
  vi.mocked(emitOutboundEvent).mockClear();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("refundGiftCardStripe", () => {
  it("pose refundedAt + refundedAmount, garde paymentStatus PAID, émet le payload daté", async () => {
    await makeAdmin();
    const card = await makePublicCard(15000);
    refundsCreate.mockResolvedValue({ id: "re_1", amount: 15000, status: "succeeded" });

    const res = await refundGiftCardStripe(card.id);
    expect(res.ok).toBe(true);

    const updated = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated.refundedAmount).toBe(15000);
    expect(updated.refundedAt).not.toBeNull();
    expect(updated.status).toBe("REFUNDED");
    expect(updated.paymentStatus).toBe("PAID"); // invariant D5

    const call = vi.mocked(emitOutboundEvent).mock.calls.find(([t]) => t === "gift_card.refunded");
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ giftCardId: card.id, refundedAmountCents: 15000 });
    expect(typeof payload.refundedAt).toBe("string"); // date présente pour l'ERP
  });

  it("n'écrit rien si le remboursement Stripe n'a pas réussi", async () => {
    await makeAdmin();
    const card = await makePublicCard(15000);
    refundsCreate.mockResolvedValue({ id: "re_2", amount: 15000, status: "failed" });

    const res = await refundGiftCardStripe(card.id);
    expect(res.ok).toBe(false);

    const updated = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated.refundedAmount).toBeNull();
    expect(updated.refundedAt).toBeNull();
    expect(updated.status).toBe("ACTIVE");
    expect(vi.mocked(emitOutboundEvent).mock.calls.find(([t]) => t === "gift_card.refunded")).toBeUndefined();
  });
});

describe("refundGiftCardOffline (carte vendue au comptoir)", () => {
  it("rembourse une carte ADMIN_SALE non entamée, pose refundMethod + refundedAt, émet le payload daté", async () => {
    await makeAdmin();
    const card = await makeSalonCard(5000);

    const res = await refundGiftCardOffline(card.id, "cash");
    expect(res.ok).toBe(true);

    const updated = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated.status).toBe("REFUNDED");
    expect(updated.paymentStatus).toBe("PAID"); // invariant D5
    expect(updated.refundedAmount).toBe(5000);
    expect(updated.refundedAt).not.toBeNull();
    expect(updated.refundMethod).toBe("cash");
    expect(updated.remainingAmountCents).toBe(0);

    const call = vi.mocked(emitOutboundEvent).mock.calls.find(([t]) => t === "gift_card.refunded");
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ giftCardId: card.id, refundedAmountCents: 5000 });
    expect(typeof (call![1] as Record<string, unknown>).refundedAt).toBe("string");
  });

  it("refuse une carte déjà entamée (sans reliquat, D2)", async () => {
    await makeAdmin();
    const card = await makeSalonCard(5000, 2000); // 20 € déjà consommés

    const res = await refundGiftCardOffline(card.id, "cash");
    expect(res.ok).toBe(false);

    const updated = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated.refundedAt).toBeNull();
    expect(updated.status).toBe("PARTIALLY_USED");
  });

  it("refuse une carte payée par Stripe (doit passer par le remboursement Stripe)", async () => {
    await makeAdmin();
    const card = await makePublicCard(5000); // a un stripePaymentId

    const res = await refundGiftCardOffline(card.id, "cash");
    expect(res.ok).toBe(false);

    const updated = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated.refundedAt).toBeNull();
  });

  it("refuse une carte ADMIN_GIFT (geste commercial hors CA) — un refund serait fantôme côté ERP", async () => {
    await makeAdmin();
    const card = await db.giftCard.create({
      data: {
        code: `GC-${randomUUID().slice(0, 8)}`,
        codeHash: `hash-${randomUUID()}`,
        prefix: "GI12",
        initialAmountCents: 5000,
        remainingAmountCents: 5000,
        amount: 5000,
        deliveryMode: "EMAIL_TO_BUYER",
        buyerName: "Cliente",
        buyerEmail: "gift@test.local",
        creationMode: "ADMIN_GIFT", // jamais comptée au CA, pas de stripePaymentId
        paymentStatus: "PAID",
        status: "ACTIVE",
        expiresAt: new Date("2027-05-02T10:00:00.000Z"),
      },
    });

    const res = await refundGiftCardOffline(card.id, "cash");
    expect(res.ok).toBe(false);

    const updated = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated.refundedAt).toBeNull();
    expect(updated.status).toBe("ACTIVE");
    expect(vi.mocked(emitOutboundEvent).mock.calls.find(([t]) => t === "gift_card.refunded")).toBeUndefined();
  });
});
