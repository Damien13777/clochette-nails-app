import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, truncateAll } from "../e2e/db";
import { createInvoice, createCreditNote, InvoiceError } from "@/lib/invoice/create-invoice";

async function makeIssuedInvoice() {
  await db.platformSettings.create({ data: {} });
  return createInvoice({
    docType: "INVOICE",
    sourceType: "GIFT_CARD",
    customerName: "Cliente Test",
    customerEmail: "c@test.local",
    lines: [{ label: "Carte cadeau ••TEST", quantity: 1, unitCents: 5000, totalCents: 5000 }],
    payments: [{ label: "Espèces", amountCents: 5000 }],
    totalCents: 5000,
  });
}

beforeAll(async () => {
  process.env.INVOICES_DIR = await mkdtemp(path.join(tmpdir(), "invoices-test-"));
});

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("createCreditNote", () => {
  it("avoir lié, série AV, montants/snapshots copiés", async () => {
    const parent = await makeIssuedInvoice();
    const cn = await createCreditNote({
      parentInvoiceId: parent.id,
      amountCents: 2000,
      reason: "Geste commercial",
    });
    expect(cn.number).toMatch(/^AV-\d{4}-0001$/);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: cn.id },
      select: {
        docType: true,
        parentInvoiceId: true,
        totalCents: true,
        customerEmail: true,
        sourceType: true,
      },
    });
    expect(row.docType).toBe("CREDIT_NOTE");
    expect(row.parentInvoiceId).toBe(parent.id);
    expect(row.totalCents).toBe(2000);
    expect(row.customerEmail).toBe("c@test.local");
    expect(row.sourceType).toBe("GIFT_CARD");
  });

  it("plafond = total − avoirs déjà émis", async () => {
    const parent = await makeIssuedInvoice();
    await createCreditNote({ parentInvoiceId: parent.id, amountCents: 4000 });
    await expect(
      createCreditNote({ parentInvoiceId: parent.id, amountCents: 1500 }),
    ).rejects.toThrow(InvoiceError);
    await createCreditNote({ parentInvoiceId: parent.id, amountCents: 1000 });
  });

  it("refuse un avoir sur un avoir", async () => {
    const parent = await makeIssuedInvoice();
    const cn = await createCreditNote({ parentInvoiceId: parent.id, amountCents: 1000 });
    await expect(createCreditNote({ parentInvoiceId: cn.id, amountCents: 500 })).rejects.toThrow(
      /facture/i,
    );
  });
});
