/**
 * /admin/finances — Vue d'ensemble des finances.
 *
 * Server Component qui :
 *  - lit les searchParams (from / to / compareFrom / compareTo)
 *  - défaut = mois courant
 *  - appelle computeFinances + computeDailySeries en parallèle (+ idem
 *    pour la période de comparaison si présente)
 *  - rend : sélecteur période, KPIs, breakdown, graphique, table, détails
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  computeDailySeries,
  computeFinanceAnalytics,
  computeFinances,
  type DailySeriesPoint,
  type FinanceResult,
} from "@/lib/finances";
import { BreakdownCards } from "./breakdown-cards";
import { FinancesChart } from "./finances-chart";
import { KpiCards } from "./kpi-cards";
import { PeriodSelector } from "./period-selector";
import { TransactionsTable } from "./transactions-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finances · Admin",
  robots: { index: false, follow: false },
};

type SearchParams = {
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
};

function isValidIsoDate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function isoDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function defaultRange(now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    from: isoDateOnly(new Date(Date.UTC(y, m, 1))),
    to: isoDateOnly(new Date(Date.UTC(y, m + 1, 1))),
  };
}

function formatPeriodLabel(fromIso: string, toIso: string): string {
  const f = parseIso(fromIso);
  const t = parseIso(toIso);
  // si la période fait pile 1 mois calendaire, afficher "mois année"
  if (
    f.getUTCDate() === 1 &&
    t.getUTCDate() === 1 &&
    ((f.getUTCFullYear() === t.getUTCFullYear() &&
      t.getUTCMonth() === f.getUTCMonth() + 1) ||
      (t.getUTCFullYear() === f.getUTCFullYear() + 1 &&
        f.getUTCMonth() === 11 &&
        t.getUTCMonth() === 0))
  ) {
    return f.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  // si année calendaire complète
  if (
    f.getUTCDate() === 1 &&
    f.getUTCMonth() === 0 &&
    t.getUTCDate() === 1 &&
    t.getUTCMonth() === 0 &&
    t.getUTCFullYear() === f.getUTCFullYear() + 1
  ) {
    return String(f.getUTCFullYear());
  }
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  };
  const tInclusive = new Date(t.getTime() - 24 * 60 * 60 * 1000);
  return `${f.toLocaleDateString("fr-FR", opts)} → ${tInclusive.toLocaleDateString("fr-FR", opts)}`;
}

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const now = new Date();
  const defaults = defaultRange(now);

  const fromIso = isValidIsoDate(params.from) ? params.from : defaults.from;
  const toIso = isValidIsoDate(params.to) ? params.to : defaults.to;
  const from = parseIso(fromIso);
  const to = parseIso(toIso);

  const hasComparison =
    isValidIsoDate(params.compareFrom) && isValidIsoDate(params.compareTo);
  const compareFromIso = hasComparison ? params.compareFrom! : null;
  const compareToIso = hasComparison ? params.compareTo! : null;

  const [current, currentSeries, comparison, comparisonSeries, analytics] =
    await Promise.all([
      computeFinances(from, to),
      computeDailySeries(from, to),
      hasComparison
        ? computeFinances(parseIso(compareFromIso!), parseIso(compareToIso!))
        : Promise.resolve<FinanceResult | null>(null),
      hasComparison
        ? computeDailySeries(parseIso(compareFromIso!), parseIso(compareToIso!))
        : Promise.resolve<DailySeriesPoint[] | null>(null),
      computeFinanceAnalytics(from, to),
    ]);

  const currentLabel = formatPeriodLabel(fromIso, toIso);
  const comparisonLabel =
    compareFromIso && compareToIso
      ? formatPeriodLabel(compareFromIso, compareToIso)
      : null;

  return (
    <div className="max-w-[1400px] mx-auto p-6 lg:p-8 space-y-8">
      <header className="space-y-2 anim-fade-up">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Tableau de bord
        </p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1
            className="text-3xl md:text-4xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Finances
          </h1>
          <Link
            href="/admin/finances/factures"
            className="px-5 h-10 inline-flex items-center rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] hover:border-[var(--color-violet-600)] hover:text-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Factures →
          </Link>
        </div>
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Période : {currentLabel}
          {comparisonLabel ? ` · comparée à ${comparisonLabel}` : ""}
        </p>
      </header>

      <PeriodSelector
        from={fromIso}
        to={toIso}
        compareFrom={compareFromIso}
        compareTo={compareToIso}
      />

      <KpiCards
        current={current.totals}
        comparison={comparison?.totals ?? null}
        breakdown={current.breakdown}
        comparisonBreakdown={comparison?.breakdown ?? null}
        analytics={analytics}
        periodLabel={currentLabel}
        comparisonLabel={comparisonLabel}
      />

      <BreakdownCards
        breakdown={current.breakdown}
        totalNet={current.totals.netCents}
        analytics={analytics}
        periodLabel={currentLabel}
      />

      <FinancesChart
        current={currentSeries}
        comparison={comparisonSeries}
        currentLabel={currentLabel}
        comparisonLabel={comparisonLabel}
      />

      <TransactionsTable
        transactions={current.transactions}
        fromIso={from.toISOString()}
        toIso={to.toISOString()}
      />

      <section
        aria-label="Détails techniques"
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5"
      >
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Détails techniques
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <Detail
            label="Total frais Stripe"
            value={formatEuro(current.totals.stripeFeeCents)}
          />
          <Detail
            label="Total remboursé"
            value={formatEuro(current.totals.refundedCents)}
          />
          <Detail
            label="Carte cadeau utilisée"
            value={formatEuro(current.totals.giftCardUsedCents)}
          />
        </dl>
        <p
          className="mt-4 text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Net = Brut − carte cadeau − frais Stripe − remboursements. Les cartes
          cadeau offertes en geste commercial (ADMIN_GIFT) sont exclues du
          chiffre d&apos;affaires.
        </p>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className="text-lg text-[var(--color-ink-900)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </dd>
    </div>
  );
}
