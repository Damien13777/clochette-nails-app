"use client";

/**
 * KpiCards — Client Component (les cards Net et Ticket moyen sont cliquables
 * et ouvrent une modale détaillée).
 *
 * 4 cards : CA brut, Net (encadré violet + expandable), Nb transactions,
 * Ticket moyen (expandable).
 * Si une période de comparaison est fournie, affiche la variation en % sous
 * chaque valeur (vert si positif, rouge si négatif).
 */

import type { FinanceAnalytics, FinanceBreakdown, FinanceTotals } from "@/lib/finances";
import { ExpandableCard } from "./expandable-card";

type Props = {
  current: FinanceTotals;
  comparison: FinanceTotals | null;
  breakdown: FinanceBreakdown;
  comparisonBreakdown?: FinanceBreakdown | null;
  analytics: FinanceAnalytics;
  periodLabel: string;
  comparisonLabel?: string | null;
};

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatInt(n: number): string {
  return n.toLocaleString("fr-FR");
}

function variation(current: number, previous: number): {
  pct: number;
  positive: boolean;
} | null {
  if (previous === 0) {
    if (current === 0) return { pct: 0, positive: true };
    return null;
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  return { pct, positive: diff >= 0 };
}

function VariationBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const v = variation(current, previous);
  if (v === null) {
    return (
      <p
        className="text-[11px] text-[var(--color-ink-500)] mt-2"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Pas de référence
      </p>
    );
  }
  const arrow = v.positive ? "▲" : "▼";
  const sign = v.positive ? "+" : "−";
  const cls = v.positive
    ? "text-[var(--color-success)]"
    : "text-[var(--color-danger)]";
  return (
    <p
      className={`text-[11px] mt-2 inline-flex items-center gap-1 ${cls}`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      <span aria-hidden="true">{arrow}</span>
      {sign}
      {Math.abs(v.pct).toFixed(1).replace(".", ",")} %
    </p>
  );
}

export function KpiCards({
  current,
  comparison,
  breakdown,
  comparisonBreakdown,
  periodLabel,
  comparisonLabel,
}: Props) {
  return (
    <section
      aria-label="Indicateurs clés"
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <Card
        label="CA brut"
        value={formatEuro(current.grossCents)}
        badge={
          comparison ? (
            <VariationBadge
              current={current.grossCents}
              previous={comparison.grossCents}
            />
          ) : null
        }
      />

      <ExpandableCard
        modalTitle="Détail du Net"
        modalSubtitle={
          comparisonLabel
            ? `${periodLabel} · comparé à ${comparisonLabel}`
            : periodLabel
        }
        modalMaxWidth="max-w-[520px]"
        modalContent={
          <NetDetailContent
            current={current}
            comparison={comparison}
            periodLabel={periodLabel}
            comparisonLabel={comparisonLabel ?? null}
          />
        }
      >
        <Card
          label="Net (après frais + refunds)"
          value={formatEuro(current.netCents)}
          highlight
          badge={
            comparison ? (
              <VariationBadge
                current={current.netCents}
                previous={comparison.netCents}
              />
            ) : null
          }
        />
      </ExpandableCard>

      <Card
        label="Transactions"
        value={formatInt(current.count)}
        badge={
          comparison ? (
            <VariationBadge
              current={current.count}
              previous={comparison.count}
            />
          ) : null
        }
      />

      <ExpandableCard
        modalTitle="Ticket moyen par source"
        modalSubtitle={periodLabel}
        modalMaxWidth="max-w-[520px]"
        modalContent={
          <AverageTicketContent
            breakdown={breakdown}
            comparisonBreakdown={comparisonBreakdown ?? null}
            comparisonLabel={comparisonLabel ?? null}
          />
        }
      >
        <Card
          label="Ticket moyen"
          value={formatEuro(current.averageGrossCents)}
          badge={
            comparison ? (
              <VariationBadge
                current={current.averageGrossCents}
                previous={comparison.averageGrossCents}
              />
            ) : null
          }
        />
      </ExpandableCard>
    </section>
  );
}

function Card({
  label,
  value,
  badge,
  highlight = false,
}: {
  label: string;
  value: string;
  badge: React.ReactNode;
  highlight?: boolean;
}) {
  const borderCls = highlight
    ? "border-[var(--color-violet-300)] bg-[var(--color-violet-50)]/40"
    : "border-[var(--color-line)] bg-[var(--color-paper)]";
  const valueCls = highlight
    ? "text-[var(--color-violet-700)]"
    : "text-[var(--color-ink-900)]";
  return (
    <div
      className={`rounded-[var(--radius-md)] border p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${borderCls}`}
    >
      <p
        className={`text-3xl ${valueCls}`}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      <p
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mt-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </p>
      {badge}
    </div>
  );
}

// ─── Modal contents ──────────────────────────────────────────

function NetDetailContent({
  current,
  comparison,
  periodLabel,
  comparisonLabel,
}: {
  current: FinanceTotals;
  comparison: FinanceTotals | null;
  periodLabel: string;
  comparisonLabel: string | null;
}) {
  const rows: { label: string; value: (t: FinanceTotals) => number; sign?: "+" | "−" }[] = [
    { label: "Brut", value: (t) => t.grossCents, sign: "+" },
    { label: "Carte cadeau utilisée", value: (t) => t.giftCardUsedCents, sign: "−" },
    { label: "Frais Stripe", value: (t) => t.stripeFeeCents, sign: "−" },
    { label: "Remboursé", value: (t) => t.refundedCents, sign: "−" },
  ];

  return (
    <div className="space-y-5">
      <p
        className="text-xs text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Calcul : Net = Brut − GC utilisée − Frais Stripe − Remboursé
      </p>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)]">
        <table
          className="w-full text-sm"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <thead className="bg-[var(--color-bone)]">
            <tr>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] font-normal">
                Ligne
              </th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] font-normal">
                {periodLabel}
              </th>
              {comparison && (
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] font-normal">
                  {comparisonLabel ?? "Comparaison"}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className="border-t border-[var(--color-line)]"
              >
                <td className="px-4 py-2 text-[var(--color-ink-700)]">
                  <span className="text-[var(--color-ink-500)] mr-1">{r.sign}</span>
                  {r.label}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-900)]">
                  {formatEuro(r.value(current))}
                </td>
                {comparison && (
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-500)]">
                    {formatEuro(r.value(comparison))}
                  </td>
                )}
              </tr>
            ))}
            <tr className="border-t border-[var(--color-line)] bg-[var(--color-violet-50)]/40">
              <td
                className="px-4 py-3 text-[var(--color-violet-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                = Net
              </td>
              <td
                className="px-4 py-3 text-right tabular-nums text-[var(--color-violet-700)] text-base"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {formatEuro(current.netCents)}
              </td>
              {comparison && (
                <td
                  className="px-4 py-3 text-right tabular-nums text-[var(--color-violet-700)]/70 text-base"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {formatEuro(comparison.netCents)}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AverageTicketContent({
  breakdown,
  comparisonBreakdown,
  comparisonLabel,
}: {
  breakdown: FinanceBreakdown;
  comparisonBreakdown: FinanceBreakdown | null;
  comparisonLabel: string | null;
}) {
  const sources: {
    label: string;
    accent: "violet" | "gold" | "bone";
    totals: FinanceTotals;
    compare: FinanceTotals | null;
  }[] = [
    {
      label: "Bookings",
      accent: "violet",
      totals: breakdown.bookings,
      compare: comparisonBreakdown?.bookings ?? null,
    },
    {
      label: "Cartes cadeau",
      accent: "gold",
      totals: breakdown.giftCards,
      compare: comparisonBreakdown?.giftCards ?? null,
    },
    {
      label: "Ebooks",
      accent: "bone",
      totals: breakdown.ebooks,
      compare: comparisonBreakdown?.ebooks ?? null,
    },
  ];

  const accentDot = (a: "violet" | "gold" | "bone") =>
    a === "violet"
      ? "bg-[var(--color-violet-600)]"
      : a === "gold"
        ? "bg-[var(--color-gold-500)]"
        : "bg-[var(--color-ink-300)]";

  return (
    <div className="space-y-3">
      <p
        className="text-xs text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Ticket moyen = brut total / nombre de transactions encaissées (hors 0 €), pour chaque source.
      </p>

      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
        {sources.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full shrink-0 ${accentDot(s.accent)}`}
              />
              <div className="min-w-0">
                <p
                  className="text-sm text-[var(--color-ink-900)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {s.label}
                </p>
                <p
                  className="text-[11px] text-[var(--color-ink-500)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {s.totals.count} transaction{s.totals.count > 1 ? "s" : ""}
                  {s.compare && comparisonLabel
                    ? ` · ${s.compare.count} en ${comparisonLabel}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className="text-lg tabular-nums text-[var(--color-ink-900)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {formatEuro(s.totals.averageGrossCents)}
              </p>
              {s.compare && (
                <p
                  className="text-[11px] tabular-nums text-[var(--color-ink-500)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  vs {formatEuro(s.compare.averageGrossCents)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
