/**
 * refundEbookPurchase — écriture du remboursement.
 *
 * Vérifie que le remboursement d'un ebook pose refundedAt (pour dater la ligne
 * négative en compta) et enrichit le payload ebook.refunded, et que la garde
 * refund.status empêche d'écrire un remboursement non finalisé.
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
  InvoiceError: class extends Error {},
}));
vi.mock("@/lib/invoice/invoice-files", () => ({ readInvoicePdf: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/invoice/invoice-email", () => ({ markInvoiceSent: vi.fn() }));

const refundsCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: { refunds: { create: (...a: unknown[]) => refundsCreate(...a) } } }));

import { requireAdmin } from "@/lib/auth-guards";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { refundEbookPurchase } from "@/lib/actions/ebook-sales-admin";

async function makeAdmin() {
  const rand = randomUUID().slice(0, 8);
  const admin = await db.user.create({ data: { email: `admin-${rand}@test.local`, role: "ADMIN" } });
  vi.mocked(requireAdmin).mockResolvedValue({ id: admin.id, email: admin.email });
  return admin;
}

async function makePurchase(amountCents: number) {
  const ebook = await db.ebook.create({
    data: {
      slug: `ebook-${randomUUID().slice(0, 8)}`,
      title: "Guide",
      shortDesc: "d",
      description: "d",
      priceCents: amountCents,
      status: "PUBLISHED",
    },
  });
  return db.ebookPurchase.create({
    data: {
      ebookId: ebook.id,
      clientEmail: `cliente-${randomUUID().slice(0, 8)}@test.local`,
      amount: amountCents,
      paymentStatus: "PAID",
      paidAt: new Date("2026-05-10T10:00:00.000Z"),
      stripePaymentId: `pi_${randomUUID().slice(0, 12)}`,
      downloadToken: randomUUID().replace(/-/g, ""),
      tokenExpiresAt: new Date("2026-06-10T10:00:00.000Z"),
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

describe("refundEbookPurchase", () => {
  it("pose refundedAt + enrichit le payload ebook.refunded", async () => {
    await makeAdmin();
    const p = await makePurchase(1900);
    refundsCreate.mockResolvedValue({ id: "re_1", amount: 1900, status: "succeeded" });

    const res = await refundEbookPurchase(p.id, "test");
    expect(res.ok).toBe(true);

    const updated = await db.ebookPurchase.findUniqueOrThrow({ where: { id: p.id } });
    expect(updated.paymentStatus).toBe("REFUNDED");
    expect(updated.refundedAmount).toBe(1900);
    expect(updated.refundedAt).not.toBeNull();

    const call = vi.mocked(emitOutboundEvent).mock.calls.find(([t]) => t === "ebook.refunded");
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ purchaseId: p.id, stripeRefundedCents: 1900 });
    expect(typeof payload.refundedAt).toBe("string");
  });

  it("n'écrit rien si le remboursement Stripe n'a pas réussi", async () => {
    await makeAdmin();
    const p = await makePurchase(1900);
    refundsCreate.mockResolvedValue({ id: "re_2", amount: 1900, status: "pending" });

    const res = await refundEbookPurchase(p.id, "test");
    expect(res.ok).toBe(false);

    const updated = await db.ebookPurchase.findUniqueOrThrow({ where: { id: p.id } });
    expect(updated.paymentStatus).toBe("PAID");
    expect(updated.refundedAt).toBeNull();
    expect(vi.mocked(emitOutboundEvent).mock.calls.find(([t]) => t === "ebook.refunded")).toBeUndefined();
  });
});
