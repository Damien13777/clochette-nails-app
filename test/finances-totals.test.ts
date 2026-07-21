/**
 * sumTotals — le ticket moyen (averageGrossCents) doit se calculer sur les
 * seules transactions encaissées (> 0 €). Les encaissements à 0 € (RDV 100 %
 * carte cadeau, gestes commerciaux) ne sont pas des "tickets" et fausseraient
 * la moyenne vers le bas.
 */
import { describe, expect, it } from "vitest";
import {
  sumTotals,
  type FinanceSale,
  type FinanceTransaction,
} from "@/lib/finances-totals";

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
    refundedInGrossCents: 0,
    netCents: grossCents,
  };
}

function sale(id: string, amountCents: number): FinanceSale {
  return { id, type: "booking", amountCents };
}

/** L'équation telle que la modale « Détail du Net » la donne à lire. */
function netSelonLignesAffichees(t: {
  grossCents: number;
  giftCardUsedCents: number;
  stripeFeeCents: number;
  refundedCents: number;
  refundedInGrossCents: number;
}): number {
  return (
    t.grossCents -
    t.giftCardUsedCents -
    t.stripeFeeCents -
    (t.refundedCents - t.refundedInGrossCents)
  );
}

describe("sumTotals — les lignes affichées doivent retomber sur le Net", () => {
  it("ne déduit pas deux fois un remboursement de RDV, déjà porté par le brut", () => {
    // Acompte de 60 € (frais 0,50 €) puis remboursement de 20 € : la ligne de
    // refund porte grossCents négatif ET refundedCents positif.
    const acompte: FinanceTransaction = {
      ...tx(6000),
      stripeFeeCents: 50,
      netCents: 5950,
    };
    const refund: FinanceTransaction = {
      ...tx(-2000),
      refundedCents: 2000,
      refundedInGrossCents: 2000,
      netCents: -2000,
    };

    const t = sumTotals([acompte, refund], [sale("rdv-1", 6000)]);

    expect(t.grossCents).toBe(4000);
    expect(t.refundedCents).toBe(2000); // information conservée
    expect(t.refundedInGrossCents).toBe(2000); // dont 20 € déjà dans le brut
    expect(t.netCents).toBe(3950);
    expect(netSelonLignesAffichees(t)).toBe(t.netCents);
  });

  it("déduit bien un remboursement de carte cadeau, absent du brut", () => {
    // Une carte cadeau remboursée n'a pas de ligne négative datée (pas de champ
    // refundedAt au schéma) : son refund n'est PAS dans le brut.
    const carte: FinanceTransaction = {
      ...tx(15000),
      type: "gift_card",
      stripeFeeCents: 100,
      refundedCents: 5000,
      refundedInGrossCents: 0,
      netCents: 9900,
    };

    const t = sumTotals([carte], [{ id: "gc-1", type: "gift_card", amountCents: 15000 }]);

    expect(t.netCents).toBe(9900);
    expect(netSelonLignesAffichees(t)).toBe(t.netCents);
  });
});

describe("sumTotals — ticket moyen par VENTE", () => {
  it("recolle acompte et complément d'un même RDV en un seul ticket, même si l'acompte est encaissé sur une autre période", () => {
    // Période = juillet. Seul le complément de 50 € y est encaissé :
    // l'acompte de 10 € est tombé en juin, il n'apparaît PAS dans les lignes.
    // Le RDV honoré en juillet vaut pourtant 60 € (10 + 50) — c'est le ticket.
    const totals = sumTotals([tx(5000)], [sale("booking-cmpx0txs", 6000)]);

    expect(totals.grossCents).toBe(5000); // encaissement de la période : inchangé
    expect(totals.count).toBe(1); // 1 RDV honoré
    expect(totals.averageGrossCents).toBe(6000); // le ticket entier, pas le complément
  });

  it("exclut les ventes à 0 € de la moyenne mais les garde dans le compte", () => {
    // 2 prestations vendues 100 € et 50 €, + 1 intégralement offerte.
    const totals = sumTotals(
      [tx(10000), tx(5000), tx(0)],
      [sale("v1", 10000), sale("v2", 5000), sale("v3", 0)],
    );
    expect(totals.count).toBe(3); // 3 prestations réalisées
    expect(totals.grossCents).toBe(15000);
    // moyenne = 15000 / 2 ventes payantes = 7500 (et NON 15000 / 3 = 5000)
    expect(totals.averageGrossCents).toBe(7500);
  });

  it("renvoie 0 quand aucune vente n'est payante", () => {
    expect(sumTotals([tx(0), tx(0)], [sale("v1", 0), sale("v2", 0)]).averageGrossCents).toBe(0);
    expect(sumTotals([], []).averageGrossCents).toBe(0);
  });

  it("ne laisse pas une ligne de remboursement peser sur le ticket moyen", () => {
    // Un remboursement est un mouvement de caisse négatif : il réduit bien le
    // brut encaissé, mais il ne crée ni ne détruit une prestation vendue.
    const totals = sumTotals(
      [tx(6000), tx(-2000)],
      [sale("v1", 6000)],
    );
    expect(totals.grossCents).toBe(4000); // encaissement net du remboursement
    expect(totals.count).toBe(1); // toujours 1 prestation vendue
    expect(totals.averageGrossCents).toBe(6000); // ticket intact
  });

  it("compte une vente par prestation, pas par mouvement de caisse", () => {
    // 2 RDV honorés à 60 € et 40 €, réglés chacun en acompte + complément :
    // 4 mouvements de caisse, mais 2 ventes.
    const totals = sumTotals(
      [tx(1000), tx(5000), tx(1000), tx(3000)],
      [sale("rdv-1", 6000), sale("rdv-2", 4000)],
    );
    expect(totals.count).toBe(2);
    expect(totals.averageGrossCents).toBe(5000);
  });
});
