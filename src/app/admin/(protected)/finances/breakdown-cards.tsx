"use client";

/**
 * BreakdownCards — Client Component (les 3 cards sont cliquables et ouvrent
 * une modale d'analyse détaillée).
 *
 * 3 cards : Bookings / Cartes cadeau / Ebooks.
 * Chaque card affiche : net + count + % du total net.
 * Au clic : modale avec Top prestations / analyse cartes cadeau / Top ebooks.
 */

import Link from "next/link";
import { useState } from "react";
import type {
  FinanceAnalytics,
  FinanceBreakdown,
  FinanceTotals,
  MonthStats,
  SeasonStats,
  TopItem,
  WeekdayStats,
} from "@/lib/finances";
import { ExpandableCard } from "./expandable-card";

type Props = {
  breakdown: FinanceBreakdown;
  totalNet: number;
  analytics: FinanceAnalytics;
  periodLabel: string;
};

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function percentOf(part: number, total: number): string {
  if (total <= 0) return "0 %";
  return ((part / total) * 100).toFixed(1).replace(".", ",") + " %";
}

export function BreakdownCards({
  breakdown,
  totalNet,
  analytics,
  periodLabel,
}: Props) {
  return (
    <section
      aria-label="Répartition par source"
      className="grid grid-cols-1 sm:grid-cols-3 gap-4"
    >
      <ExpandableCard
        modalTitle="Top prestations vendues"
        modalSubtitle={periodLabel}
        modalMaxWidth="max-w-[720px]"
        modalContent={
          <TopItemsContent
            items={analytics.topServices}
            emptyMessage="Aucune prestation vendue sur cette période"
            ctaLabel="Voir toutes les prestations"
            ctaHref="/admin/prestations"
            itemLabel="Prestation"
          />
        }
      >
        <Card
          title="Bookings"
          accent="violet"
          netCents={breakdown.bookings.netCents}
          count={breakdown.bookings.count}
          share={percentOf(breakdown.bookings.netCents, totalNet)}
        />
      </ExpandableCard>

      <ExpandableCard
        modalTitle="Cartes cadeau — analyse"
        modalSubtitle={periodLabel}
        modalMaxWidth="max-w-[720px]"
        modalContent={
          <GiftCardAnalyticsContent
            totals={breakdown.giftCards}
            weekdays={analytics.giftCardWeekdayDistribution}
            months={analytics.giftCardMonthlyDistribution}
            seasons={analytics.giftCardSeasonalDistribution}
          />
        }
      >
        <Card
          title="Cartes cadeau"
          accent="gold"
          netCents={breakdown.giftCards.netCents}
          count={breakdown.giftCards.count}
          share={percentOf(breakdown.giftCards.netCents, totalNet)}
        />
      </ExpandableCard>

      <ExpandableCard
        modalTitle="Top ebooks vendus"
        modalSubtitle={periodLabel}
        modalMaxWidth="max-w-[720px]"
        modalContent={
          <TopItemsContent
            items={analytics.topEbooks}
            emptyMessage="Aucun ebook vendu sur cette période"
            ctaLabel="Voir le catalogue ebooks"
            ctaHref="/admin/ebooks"
            itemLabel="Titre"
          />
        }
      >
        <Card
          title="Ebooks"
          accent="bone"
          netCents={breakdown.ebooks.netCents}
          count={breakdown.ebooks.count}
          share={percentOf(breakdown.ebooks.netCents, totalNet)}
        />
      </ExpandableCard>
    </section>
  );
}

function Card({
  title,
  accent,
  netCents,
  count,
  share,
}: {
  title: string;
  accent: "violet" | "gold" | "bone";
  netCents: number;
  count: number;
  share: string;
}) {
  const dotCls =
    accent === "violet"
      ? "bg-[var(--color-violet-600)]"
      : accent === "gold"
        ? "bg-[var(--color-gold-500)]"
        : "bg-[var(--color-ink-300)]";

  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-2 h-2 rounded-full ${dotCls}`}
          aria-hidden="true"
        />
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </p>
      </div>
      <p
        className="text-2xl text-[var(--color-ink-900)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {formatEuro(netCents)}
      </p>
      <div
        className="mt-2 flex items-baseline justify-between text-xs text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <span>
          {count} transaction{count > 1 ? "s" : ""}
        </span>
        <span>{share} du net</span>
      </div>
    </div>
  );
}

// ─── Modal contents ──────────────────────────────────────────

function TopItemsContent({
  items,
  emptyMessage,
  ctaLabel,
  ctaHref,
  itemLabel,
}: {
  items: TopItem[];
  emptyMessage: string;
  ctaLabel: string;
  ctaHref: string;
  itemLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <p
          className="text-sm text-[var(--color-ink-500)] italic"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {emptyMessage}
        </p>
        <Link
          href={ctaHref}
          className="inline-flex text-sm text-[var(--color-violet-700)] hover:underline"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {ctaLabel} →
        </Link>
      </div>
    );
  }

  const totalCount = items.reduce((s, it) => s + it.count, 0);
  const totalNet = items.reduce((s, it) => s + it.netCents, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)]">
        <table
          className="w-full text-sm"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <thead className="bg-[var(--color-bone)]">
            <tr>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] font-normal">
                {itemLabel}
              </th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] font-normal">
                Ventes
              </th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] font-normal">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr
                key={it.slug ?? `${it.title}-${idx}`}
                className="border-t border-[var(--color-line)]"
              >
                <td className="px-4 py-2 text-[var(--color-ink-900)]">
                  <span className="text-[var(--color-ink-500)] mr-2 tabular-nums">
                    {idx + 1}.
                  </span>
                  {it.title}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-700)]">
                  {it.count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-900)]">
                  {formatEuro(it.netCents)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-[var(--color-line)] bg-[var(--color-bone)]">
              <td
                className="px-4 py-2 text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Total (top {items.length})
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-900)]">
                {totalCount}
              </td>
              <td
                className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-900)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {formatEuro(totalNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Link
          href={ctaHref}
          className="text-sm text-[var(--color-violet-700)] hover:underline"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {ctaLabel} →
        </Link>
      </div>
    </div>
  );
}

type DistributionView = "weekday" | "month" | "season";

type DistributionRow = {
  key: string;
  label: string;
  count: number;
  totalCents: number;
};

function GiftCardAnalyticsContent({
  totals,
  weekdays,
  months,
  seasons,
}: {
  totals: FinanceTotals;
  weekdays: WeekdayStats[];
  months: MonthStats[];
  seasons: SeasonStats[];
}) {
  const [view, setView] = useState<DistributionView>("weekday");

  // Adapter les data au type commun selon la vue
  const rows: DistributionRow[] =
    view === "weekday"
      ? weekdays.map((d) => ({
          key: String(d.weekday),
          label: d.label,
          count: d.count,
          totalCents: d.totalCents,
        }))
      : view === "month"
        ? months.map((m) => ({
            key: String(m.month),
            label: m.label,
            count: m.count,
            totalCents: m.totalCents,
          }))
        : seasons.map((s) => ({
            key: s.season,
            label: s.label,
            count: s.count,
            totalCents: s.totalCents,
          }));

  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const maxCount = Math.max(0, ...rows.map((r) => r.count));
  const maxRow = rows.find((r) => r.count === maxCount && maxCount > 0);

  const sectionLabel =
    view === "weekday"
      ? "Répartition par jour d'achat"
      : view === "month"
        ? "Répartition par mois d'achat"
        : "Répartition par saison d'achat";

  const insightSingular =
    view === "weekday" ? "Le jour" : view === "month" ? "Le mois" : "La saison";
  const insightArticle =
    view === "weekday" || view === "month" ? "le plus propice" : "la plus propice";

  // Label de colonne gauche selon la vue (largeur fixe pour alignement)
  const labelColWidth =
    view === "weekday" ? "100px" : view === "month" ? "100px" : "100px";

  return (
    <div className="space-y-6">
      {/* Bloc 1 — Montants */}
      <section>
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Montants
        </p>
        {totals.count === 0 ? (
          <p
            className="text-sm text-[var(--color-ink-500)] italic"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune carte cadeau vendue sur cette période
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat
              label="Montant moyen"
              value={formatEuro(totals.averageGrossCents)}
            />
            <Stat
              label="Cartes vendues"
              value={String(totals.count)}
            />
            <Stat
              label="Total brut"
              value={formatEuro(totals.grossCents)}
            />
            <Stat label="Total net" value={formatEuro(totals.netCents)} />
          </dl>
        )}
      </section>

      {/* Bloc 2 — Répartition avec toggle jour / mois / saison */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3">
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {sectionLabel}
          </p>
          <div
            role="tablist"
            aria-label="Mode de répartition"
            className="inline-flex rounded-full border border-[var(--color-line)] bg-[var(--color-bone)]/40 p-0.5 text-[10px] uppercase tracking-[0.06em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {(
              [
                { v: "weekday" as const, l: "Jour" },
                { v: "month" as const, l: "Mois" },
                { v: "season" as const, l: "Saison" },
              ]
            ).map((opt) => (
              <button
                key={opt.v}
                role="tab"
                aria-selected={view === opt.v}
                type="button"
                onClick={() => setView(opt.v)}
                className={`px-3 h-6 rounded-full transition-colors ${
                  view === opt.v
                    ? "bg-[var(--color-gold-500)]/30 text-[var(--color-ink-900)]"
                    : "text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {rows.map((r) => {
            const ratio = maxCount > 0 ? r.count / maxCount : 0;
            const isMax = maxCount > 0 && r.count === maxCount;
            return (
              <li
                key={r.key}
                className="grid items-center gap-3 text-sm"
                style={{
                  fontFamily: "var(--font-ui)",
                  gridTemplateColumns: `${labelColWidth} 1fr auto`,
                }}
              >
                <span
                  className={
                    isMax
                      ? "text-[var(--color-gold-600)]"
                      : "text-[var(--color-ink-700)]"
                  }
                >
                  {r.label}
                </span>
                <div className="relative h-3 bg-[var(--color-bone)] rounded-full overflow-hidden">
                  <div
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                      isMax
                        ? "bg-[var(--color-gold-600)]"
                        : "bg-[var(--color-gold-500)]/60"
                    }`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-[var(--color-ink-500)] whitespace-nowrap">
                  {r.count} · {formatEuro(r.totalCents)}
                </span>
              </li>
            );
          })}
        </ul>

        {totalCount > 0 && maxRow && (
          <p
            className="mt-4 text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {insightSingular} {insightArticle} :{" "}
            <strong className="text-[var(--color-gold-600)]">
              {maxRow.label}
            </strong>{" "}
            ({maxRow.count} carte{maxRow.count > 1 ? "s" : ""} vendue
            {maxRow.count > 1 ? "s" : ""})
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] px-3 py-2 bg-[var(--color-gold-50)]/30">
      <dt
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className="text-base text-[var(--color-ink-900)] mt-0.5"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </dd>
    </div>
  );
}
