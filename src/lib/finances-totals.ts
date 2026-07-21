/**
 * Agrégation pure des transactions financières — sans dépendance Prisma,
 * donc testable unitairement (extrait de finances.ts qui, lui, importe la DB).
 *
 * Deux notions DISTINCTES cohabitent ici, et les confondre est précisément le
 * bug qu'on corrige :
 *
 *  - une TRANSACTION (FinanceTransaction) = un MOUVEMENT de caisse daté. En
 *    compta d'encaissement un même RDV en produit jusqu'à trois (acompte à la
 *    confirmation, complément à l'honoré, remboursement à l'annulation). Les
 *    agrégats monétaires (brut, frais, remboursé, net) s'en déduisent, et eux
 *    seuls : c'est ce qui est réconcilié au centime avec l'ERP.
 *
 *  - une VENTE (FinanceSale) = une PRESTATION ou un PRODUIT vendu, compté une
 *    seule fois pour son montant entier. Un RDV honoré à 60 € réglé en 10 €
 *    d'acompte puis 50 € au salon est UNE vente de 60 €, même si les deux
 *    encaissements tombent sur deux mois différents. Le nombre de ventes et le
 *    ticket moyen s'en déduisent, et eux seuls.
 *
 * Conséquence assumée : ticket moyen × nombre de ventes ≠ CA brut de la
 * période. Les deux chiffres répondent à deux questions différentes — « combien
 * d'argent est rentré ce mois-ci » et « combien vaut une prestation ».
 */
import type {
  FinanceTransaction,
  FinanceTotals,
  TransactionType,
} from "@/lib/finances";

export type { FinanceTransaction, FinanceTotals } from "@/lib/finances";

export type FinanceSale = {
  id: string;
  type: TransactionType;
  amountCents: number;
};

export function sumTotals(
  txs: FinanceTransaction[],
  sales: FinanceSale[],
): FinanceTotals {
  const t = txs.reduce(
    (acc, x) => ({
      grossCents: acc.grossCents + x.grossCents,
      giftCardUsedCents: acc.giftCardUsedCents + x.giftCardUsedCents,
      stripeFeeCents: acc.stripeFeeCents + x.stripeFeeCents,
      refundedCents: acc.refundedCents + x.refundedCents,
      refundedInGrossCents: acc.refundedInGrossCents + x.refundedInGrossCents,
      netCents: acc.netCents + x.netCents,
    }),
    {
      grossCents: 0,
      giftCardUsedCents: 0,
      stripeFeeCents: 0,
      refundedCents: 0,
      refundedInGrossCents: 0,
      netCents: 0,
    },
  );
  // Une vente à 0 € (prestation intégralement offerte, geste commercial) n'est
  // pas un ticket : elle reste comptée dans le nombre de ventes mais sortirait
  // la moyenne de son sens en la tirant vers le bas.
  const paying = sales.filter((s) => s.amountCents > 0);
  const payingTotal = paying.reduce((sum, s) => sum + s.amountCents, 0);
  return {
    ...t,
    count: sales.length,
    averageGrossCents:
      paying.length > 0 ? Math.round(payingTotal / paying.length) : 0,
  };
}
