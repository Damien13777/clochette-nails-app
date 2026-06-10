/**
 * Outil dev : génère des PDFs d'exemple (facture + avoir) avec les settings
 * réels de la base dev, SANS écrire en DB (pas de numéro consommé).
 * Usage : pnpm exec dotenv -e .env.local -- tsx scripts/preview-invoice-pdf.tsx
 * Sortie : /tmp/facture-exemple.pdf + /tmp/avoir-exemple.pdf
 */

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { renderInvoicePdf } from "../src/lib/invoice/invoice-pdf";
import type { SellerSnapshot } from "../src/lib/invoice/types";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const s = await prisma.platformSettings.findFirstOrThrow();
  const seller: SellerSnapshot = {
    headerName: s.invoiceHeaderName ?? s.businessName,
    legalOwner: s.invoiceLegalOwner,
    address: s.businessAddress ?? "12 rue Exemple\n79320 Moncoutant-sur-Sèvre",
    siret: s.businessSiret ?? "123 456 789 00012",
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone ?? "06 12 34 56 78",
    vatMention: s.invoiceVatMention,
    legalFooter:
      s.invoiceLegalFooter ??
      "Immatriculée au Registre National des Entreprises (RNE) — métiers d'art et de l'artisanat\nAssurance RC pro : [Assureur] — couverture France métropolitaine\nMédiateur de la consommation : [à compléter]",
    logoUrl: s.invoiceLogoUrl,
    vatEnabled: s.vatEnabled,
    vatRate: s.vatRate,
  };

  let logoPng: Buffer | null = null;
  if (seller.logoUrl?.endsWith(".png")) {
    logoPng = await readFile(
      path.join(process.cwd(), "public", seller.logoUrl.replace(/^\//, "")),
    );
  }

  const facture = await renderInvoicePdf({
    number: "FAC-2026-0042",
    docType: "INVOICE",
    issuedAt: new Date(),
    serviceDate: new Date("2026-06-10"),
    seller,
    logoPng,
    customerName: "Marie Durand",
    customerEmail: "marie.durand@example.com",
    lines: [
      { label: "Pose gel complète", quantity: 1, unitCents: 6000, totalCents: 6000 },
      { label: "Nail art (2 ongles)", quantity: 1, unitCents: 1500, totalCents: 1500 },
      { label: "Remise / ajustement", quantity: 1, unitCents: -500, totalCents: -500 },
    ],
    payments: [
      { label: "Acompte payé en ligne (carte bancaire)", amountCents: 2250 },
      { label: "Espèces", amountCents: 2750 },
      { label: "Carte cadeau ••K7PM", amountCents: 2000 },
    ],
    totalCents: 7000,
    parentNumber: null,
  });
  await writeFile("/tmp/facture-exemple.pdf", facture);

  const avoir = await renderInvoicePdf({
    number: "AV-2026-0003",
    docType: "CREDIT_NOTE",
    issuedAt: new Date(),
    serviceDate: null,
    seller,
    logoPng,
    customerName: "Marie Durand",
    customerEmail: "marie.durand@example.com",
    lines: [
      { label: "Remboursement carte cadeau", quantity: 1, unitCents: 5000, totalCents: 5000 },
    ],
    payments: [{ label: "Remboursement", amountCents: 5000 }],
    totalCents: 5000,
    parentNumber: "FAC-2026-0038",
  });
  await writeFile("/tmp/avoir-exemple.pdf", avoir);

  console.log("OK → /tmp/facture-exemple.pdf + /tmp/avoir-exemple.pdf");
  await prisma.$disconnect();
}

main();
