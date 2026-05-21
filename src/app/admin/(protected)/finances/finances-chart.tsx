"use client";

/**
 * FinancesChart — Client Component (Recharts).
 *
 * Affiche une série temporelle (1 ou 2 séries si comparaison).
 * - Toggle Lignes / Barres
 * - Toggle Net / Brut
 * - Agrégation auto par mois si la période > 60 jours
 * - Tooltip custom (montants en €)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailySeriesPoint } from "@/lib/finances";

type Props = {
  current: DailySeriesPoint[];
  comparison: DailySeriesPoint[] | null;
  currentLabel: string;
  comparisonLabel: string | null;
};

type ChartMode = "line" | "bar";
type Measure = "net" | "gross";

const COLOR_CURRENT = "#5E4392";
const COLOR_COMPARISON = "#CCAAD2";

function formatEuroAxis(c: number): string {
  return `${Math.round(c / 100)} €`;
}

function formatEuroTooltip(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

function formatXShort(iso: string, aggregated: boolean): string {
  if (aggregated) {
    const [y, m] = iso.split("-");
    const months = [
      "janv.",
      "févr.",
      "mars",
      "avr.",
      "mai",
      "juin",
      "juil.",
      "août",
      "sept.",
      "oct.",
      "nov.",
      "déc.",
    ];
    const mi = Math.max(0, Math.min(11, Number(m) - 1));
    return `${months[mi]} ${y.slice(2)}`;
  }
  const parts = iso.split("-");
  const dd = Number(parts[2]);
  const mi = Number(parts[1]) - 1;
  const months = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  return `${dd} ${months[Math.max(0, Math.min(11, mi))]}`;
}

function aggregateByMonth(points: DailySeriesPoint[]): DailySeriesPoint[] {
  const map = new Map<string, DailySeriesPoint>();
  for (const p of points) {
    const key = p.dateIso.slice(0, 7) + "-01";
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        dateIso: key,
        netCents: p.netCents,
        grossCents: p.grossCents,
        count: p.count,
      });
    } else {
      cur.netCents += p.netCents;
      cur.grossCents += p.grossCents;
      cur.count += p.count;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso),
  );
}

type Row = {
  key: string;
  label: string;
  current: number | null;
  comparison: number | null;
};

export function FinancesChart({
  current,
  comparison,
  currentLabel,
  comparisonLabel,
}: Props) {
  const [mode, setMode] = useState<ChartMode>("line");
  const [measure, setMeasure] = useState<Measure>("net");

  // Fix Recharts width=-1 warning : on attend que le DOM ait calculé les
  // dimensions du wrapper avant de render le chart, via ResizeObserver +
  // mesure explicite. ResponsiveContainer mesure trop tôt dans certains
  // layouts (flex / grid) → on le bypass en passant width fixe.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setChartWidth(Math.floor(w));
    });
    ro.observe(el);
    // Init immédiat
    setChartWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const aggregated = current.length > 60;

  const data: Row[] = useMemo(() => {
    const cur = aggregated ? aggregateByMonth(current) : current;
    const cmp = comparison
      ? aggregated
        ? aggregateByMonth(comparison)
        : comparison
      : null;

    if (!cmp) {
      return cur.map((p) => ({
        key: p.dateIso,
        label: formatXShort(p.dateIso, aggregated),
        current: measure === "net" ? p.netCents : p.grossCents,
        comparison: null,
      }));
    }
    const len = Math.max(cur.length, cmp.length);
    const rows: Row[] = [];
    for (let i = 0; i < len; i++) {
      const c = cur[i] ?? null;
      const k = cmp[i] ?? null;
      rows.push({
        key: c ? c.dateIso : `cmp-${i}`,
        label: c
          ? formatXShort(c.dateIso, aggregated)
          : k
            ? formatXShort(k.dateIso, aggregated)
            : "",
        current: c ? (measure === "net" ? c.netCents : c.grossCents) : null,
        comparison: k
          ? measure === "net"
            ? k.netCents
            : k.grossCents
          : null,
      });
    }
    return rows;
  }, [current, comparison, measure, aggregated]);

  const hasCompare = Boolean(comparison && comparisonLabel);

  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Évolution
          </p>
          <h2
            className="text-xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {measure === "net" ? "Net" : "CA brut"} ·{" "}
            {aggregated ? "par mois" : "par jour"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle<Measure>
            options={[
              { value: "net", label: "Net" },
              { value: "gross", label: "Brut" },
            ]}
            value={measure}
            onChange={setMeasure}
          />
          <SegmentedToggle<ChartMode>
            options={[
              { value: "line", label: "Lignes" },
              { value: "bar", label: "Barres" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      </header>

      <div ref={wrapperRef} className="w-full" style={{ height: 320 }}>
        {chartWidth > 0 && (mode === "line" ? (
            <LineChart width={chartWidth} height={320} data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#ece5e7" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke="#7a5c65"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#ece5e7" }}
              />
              <YAxis
                stroke="#7a5c65"
                tick={{ fontSize: 11 }}
                tickFormatter={formatEuroAxis}
                tickLine={false}
                axisLine={{ stroke: "#ece5e7" }}
                width={60}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    {...props}
                    currentLabel={currentLabel}
                    comparisonLabel={comparisonLabel}
                  />
                )}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-display)" }}
              />
              <Line
                type="monotone"
                dataKey="current"
                name={currentLabel}
                stroke={COLOR_CURRENT}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              {hasCompare && (
                <Line
                  type="monotone"
                  dataKey="comparison"
                  name={comparisonLabel ?? "Comparaison"}
                  stroke={COLOR_COMPARISON}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          ) : (
            <BarChart width={chartWidth} height={320} data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#ece5e7" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke="#7a5c65"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#ece5e7" }}
              />
              <YAxis
                stroke="#7a5c65"
                tick={{ fontSize: 11 }}
                tickFormatter={formatEuroAxis}
                tickLine={false}
                axisLine={{ stroke: "#ece5e7" }}
                width={60}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    {...props}
                    currentLabel={currentLabel}
                    comparisonLabel={comparisonLabel}
                  />
                )}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-display)" }}
              />
              <Bar
                dataKey="current"
                name={currentLabel}
                fill={COLOR_CURRENT}
                radius={[3, 3, 0, 0]}
              />
              {hasCompare && (
                <Bar
                  dataKey="comparison"
                  name={comparisonLabel ?? "Comparaison"}
                  fill={COLOR_COMPARISON}
                  radius={[3, 3, 0, 0]}
                />
              )}
            </BarChart>
          ))}
      </div>
    </section>
  );
}

type TooltipEntry = {
  dataKey?: unknown;
  value?: unknown;
  name?: unknown;
  color?: unknown;
};

type TooltipProps = {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<TooltipEntry>;
  currentLabel: string;
  comparisonLabel: string | null;
};

function ChartTooltip({ active, label, payload, currentLabel, comparisonLabel }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] p-3 shadow-[var(--shadow-md)]"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <p className="text-xs text-[var(--color-ink-700)] mb-1">
        {typeof label === "string" || typeof label === "number" ? label : ""}
      </p>
      {payload.map((entry, i) => {
        const isCmp = entry.dataKey === "comparison";
        const labelText = isCmp ? (comparisonLabel ?? "Comparaison") : currentLabel;
        const val = typeof entry.value === "number" ? entry.value : 0;
        const color = typeof entry.color === "string" ? entry.color : "#000";
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="text-[var(--color-ink-500)]">{labelText} :</span>
            <span className="text-[var(--color-ink-900)]">
              {formatEuroTooltip(val)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex items-center bg-[var(--color-bone)] rounded-full p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 h-7 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
              active
                ? "bg-[var(--color-paper)] text-[var(--color-violet-700)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
