/**
 * Agrégation pure des transactions financières — sans dépendance Prisma,
 * donc testable unitairement (extrait de finances.ts qui, lui, importe la DB).
 */
import type { FinanceTransaction, FinanceTotals } from "@/lib/finances";

export type { FinanceTransaction, FinanceTotals } from "@/lib/finances";

export function sumTotals(txs: FinanceTransaction[]): FinanceTotals {
  const t = txs.reduce(
    (acc, x) => ({
      grossCents: acc.grossCents + x.grossCents,
      giftCardUsedCents: acc.giftCardUsedCents + x.giftCardUsedCents,
      stripeFeeCents: acc.stripeFeeCents + x.stripeFeeCents,
      refundedCents: acc.refundedCents + x.refundedCents,
      netCents: acc.netCents + x.netCents,
    }),
    {
      grossCents: 0,
      giftCardUsedCents: 0,
      stripeFeeCents: 0,
      refundedCents: 0,
      netCents: 0,
    },
  );
  // Ticket moyen = sur les seules transactions encaissées (> 0 €). Les
  // encaissements à 0 € (RDV 100 % carte cadeau, gestes commerciaux) ne sont
  // pas des "tickets" et tireraient la moyenne vers le bas.
  const payingCount = txs.filter((x) => x.grossCents > 0).length;
  return {
    ...t,
    count: txs.length,
    averageGrossCents: payingCount > 0 ? Math.round(t.grossCents / payingCount) : 0,
  };
}
