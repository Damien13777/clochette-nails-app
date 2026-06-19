/**
 * sumTotals — le ticket moyen (averageGrossCents) doit se calculer sur les
 * seules transactions encaissées (> 0 €). Les encaissements à 0 € (RDV 100 %
 * carte cadeau, gestes commerciaux) ne sont pas des "tickets" et fausseraient
 * la moyenne vers le bas.
 */
import { describe, expect, it } from "vitest";
import { sumTotals, type FinanceTransaction } from "@/lib/finances-totals";

function tx(grossCents: number): FinanceTransaction {
  return {
    id: `tx-${grossCents}-${Math.random()}`,
    type: "booking",
    dateIso: new Date().toISOString(),
    ref: "ref",
    detailUrl: "/admin/bookings/x",
    clientName: "Cliente Test",
    clientEmail: "cliente@test.local",
    paymentMethod: grossCents > 0 ? "stripe" : "gift_card_full",
    grossCents,
    giftCardUsedCents: 0,
    stripeFeeCents: 0,
    refundedCents: 0,
    netCents: grossCents,
  };
}

describe("sumTotals — ticket moyen", () => {
  it("exclut les encaissements à 0 € du dénominateur", () => {
    // 100 € + 50 € encaissés, + 1 transaction à 0 € (100 % carte cadeau)
    const totals = sumTotals([tx(10000), tx(5000), tx(0)]);
    expect(totals.count).toBe(3); // le nombre total de transactions reste 3
    expect(totals.grossCents).toBe(15000);
    // moyenne = 15000 / 2 encaissées = 7500 (et NON 15000 / 3 = 5000)
    expect(totals.averageGrossCents).toBe(7500);
  });

  it("renvoie 0 quand aucune transaction n'est encaissée", () => {
    expect(sumTotals([tx(0), tx(0)]).averageGrossCents).toBe(0);
    expect(sumTotals([]).averageGrossCents).toBe(0);
  });

  it("calcule normalement quand tout est encaissé", () => {
    expect(sumTotals([tx(4000), tx(6000)]).averageGrossCents).toBe(5000);
  });
});
