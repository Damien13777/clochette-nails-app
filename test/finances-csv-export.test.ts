/**
 * Export CSV — le journal de caisse doit permettre de RETROUVER le Net à partir
 * des colonnes affichées.
 *
 * Piège : sur la ligne de remboursement d'un RDV, le montant remboursé est déjà
 * porté par le brut (qui est négatif). Le reproduire dans une colonne « Remboursé »
 * à déduire conduit à le soustraire deux fois — c'est le défaut corrigé dans la
 * modale du Net le 21/07, qui n'avait pas été répercuté ici.
 *
 * L'import de ../e2e/db précède celui de @/lib/finances : il charge .env.test, et
 * le client Prisma lit DATABASE_URL à l'import.
 */
import { describe, expect, it } from "vitest";
import "../e2e/db";
import { buildTransactionsCsv, type FinanceTransaction } from "@/lib/finances";

function ligne(over: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: "tx-1",
    type: "booking",
    dateIso: "2026-07-09T12:00:00.000Z",
    ref: "cmqt90md · remboursement",
    detailUrl: "/admin/bookings/x",
    clientName: "Cliente Test",
    clientEmail: "cliente@test.local",
    paymentMethod: "stripe",
    grossCents: 0,
    giftCardUsedCents: 0,
    stripeFeeCents: 0,
    refundedCents: 0,
    refundedInGrossCents: 0,
    netCents: 0,
    ...over,
  };
}

function parse(csv: string) {
  const [header, ...rows] = csv.replace(/^﻿/, "").split("\n");
  const cols = header.split(";");
  return rows.map((r) => {
    const vals = r.split(";");
    return (name: string) => {
      const i = cols.indexOf(name);
      if (i < 0) throw new Error(`colonne absente du CSV : ${name}`);
      return Number(vals[i].replace(",", "."));
    };
  });
}

describe("buildTransactionsCsv — le Net doit être reconstituable", () => {
  it("ne fait pas déduire deux fois un remboursement de RDV déjà porté par le brut", () => {
    // Cas réel de juillet : remboursement de 22,50 € sur le RDV cmqt90md.
    const csv = buildTransactionsCsv([
      ligne({
        grossCents: -2250,
        refundedCents: 2250,
        refundedInGrossCents: 2250,
        netCents: -2250,
      }),
    ]);

    const [get] = parse(csv);
    const net =
      get("Brut (€)") -
      get("Carte cadeau (€)") -
      get("Frais Stripe (€)") -
      get("Remboursé hors brut (€)");

    expect(net).toBe(get("Net (€)"));
    expect(get("Remboursé (€)")).toBe(22.5); // information conservée
    expect(get("Remboursé hors brut (€)")).toBe(0); // mais rien à re-déduire
  });

  it("déduit bien un remboursement de carte cadeau, absent du brut", () => {
    const csv = buildTransactionsCsv([
      ligne({
        type: "gift_card",
        grossCents: 15000,
        stripeFeeCents: 100,
        refundedCents: 5000,
        refundedInGrossCents: 0,
        netCents: 9900,
      }),
    ]);

    const [get] = parse(csv);
    const net =
      get("Brut (€)") -
      get("Carte cadeau (€)") -
      get("Frais Stripe (€)") -
      get("Remboursé hors brut (€)");

    expect(net).toBe(get("Net (€)"));
    expect(get("Remboursé hors brut (€)")).toBe(50);
  });
});
