import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, truncateAll } from "../e2e/db";
import {
  resolveDownloadToken,
  generateDownloadToken,
  MAX_DOWNLOADS_PER_TOKEN,
} from "@/lib/ebook-download-token";

async function makePurchase(opts?: {
  tokenExpiresAt?: Date;
  paymentStatus?: "PAID" | "PENDING";
}) {
  const ebook = await db.ebook.create({
    data: {
      slug: `ebook-${Math.random().toString(36).slice(2, 10)}`,
      title: "Test Ebook",
      shortDesc: "desc",
      description: "desc",
      pdfUrl: "/uploads/ebooks/test.pdf",
      priceCents: 990,
      status: "PUBLISHED",
    },
  });
  const token = generateDownloadToken();
  const purchase = await db.ebookPurchase.create({
    data: {
      ebookId: ebook.id,
      clientEmail: "client@test.local",
      amount: 990,
      paymentStatus: opts?.paymentStatus ?? "PAID",
      downloadToken: token,
      tokenExpiresAt:
        opts?.tokenExpiresAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  return { token, purchaseId: purchase.id };
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("resolveDownloadToken — cap de téléchargements", () => {
  it(`autorise ${MAX_DOWNLOADS_PER_TOKEN} DL puis EXHAUSTED`, async () => {
    const { token, purchaseId } = await makePurchase();
    for (let i = 0; i < MAX_DOWNLOADS_PER_TOKEN; i++) {
      // Repousse lastDownloadAt dans le passé pour franchir le debounce 30 s.
      await db.ebookPurchase.update({
        where: { id: purchaseId },
        data: { lastDownloadAt: new Date(Date.now() - 60_000) },
      });
      const r = await resolveDownloadToken(token);
      expect(r.ok).toBe(true);
    }
    const exhausted = await resolveDownloadToken(token);
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.reason).toBe("EXHAUSTED");

    const after = await db.ebookPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.downloadCount).toBe(MAX_DOWNLOADS_PER_TOKEN);
  });
});

describe("resolveDownloadToken — debounce 30 s (double-fetch navigateur)", () => {
  it("deux appels rapprochés ne comptent que pour un téléchargement", async () => {
    const { token, purchaseId } = await makePurchase();
    const r1 = await resolveDownloadToken(token);
    const r2 = await resolveDownloadToken(token);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const after = await db.ebookPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.downloadCount).toBe(1);
  });
});

describe("resolveDownloadToken — gardes", () => {
  it("token expiré → EXPIRED sans incrément", async () => {
    const { token, purchaseId } = await makePurchase({
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    const r = await resolveDownloadToken(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXPIRED");

    const after = await db.ebookPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.downloadCount).toBe(0);
  });

  it("paiement non confirmé → NOT_PAID", async () => {
    const { token } = await makePurchase({ paymentStatus: "PENDING" });
    const r = await resolveDownloadToken(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_PAID");
  });
});
