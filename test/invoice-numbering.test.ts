import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, truncateAll } from "../e2e/db";
import { createInvoice } from "@/lib/invoice/create-invoice";

async function makeSettings() {
  await db.platformSettings.create({
    data: {
      invoiceHeaderName: "CN manucure by Clochette Nails",
      invoiceLegalOwner: "EI Gomes Chloé",
      businessSiret: "12345678901234",
      businessAddress: "1 rue des Tests\n79320 Moncoutant-sur-Sèvre",
    },
  });
}

function minimalInput(docType: "INVOICE" | "CREDIT_NOTE" = "INVOICE") {
  return {
    docType,
    sourceType: "BOOKING" as const,
    customerName: "Cliente Test",
    customerEmail: "cliente@test.local",
    lines: [{ label: "Prestation test", quantity: 1, unitCents: 5000, totalCents: 5000 }],
    payments: [{ label: "Espèces", amountCents: 5000 }],
    totalCents: 5000,
  };
}

beforeAll(async () => {
  process.env.INVOICES_DIR = await mkdtemp(path.join(tmpdir(), "invoices-test-"));
});

beforeEach(async () => {
  await truncateAll();
  await makeSettings();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("numérotation des factures", () => {
  it("20 créations concurrentes → 20 numéros uniques et continus", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createInvoice(minimalInput())),
    );
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(20);
    const year = new Date().getFullYear();
    const expected = Array.from(
      { length: 20 },
      (_, i) => `FAC-${year}-${String(i + 1).padStart(4, "0")}`,
    ).sort();
    expect(numbers).toEqual(expected);
  });

  it("séries FAC et AV indépendantes", async () => {
    const fac = await createInvoice(minimalInput("INVOICE"));
    const fac2 = await createInvoice(minimalInput("INVOICE"));
    const av = await createInvoice({
      ...minimalInput("CREDIT_NOTE"),
      parentInvoiceId: fac.id,
      parentNumber: fac.number,
    });
    const year = new Date().getFullYear();
    expect(fac.number).toBe(`FAC-${year}-0001`);
    expect(fac2.number).toBe(`FAC-${year}-0002`);
    expect(av.number).toBe(`AV-${year}-0001`);
  });

  it("le PDF est écrit et commence par %PDF, snapshot vendeur en DB", async () => {
    const inv = await createInvoice(minimalInput());
    const { readInvoicePdf } = await import("@/lib/invoice/invoice-files");
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { pdfPath: true, sellerSnapshot: true },
    });
    const buf = await readInvoicePdf(row.pdfPath);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect((row.sellerSnapshot as { headerName: string }).headerName).toBe(
      "CN manucure by Clochette Nails",
    );
  });
});
