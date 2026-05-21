"use client";

/**
 * PeriodSelector — Client Component.
 *
 * 6 presets + custom range + toggle "Comparer à une autre période".
 * À chaque changement, push de la query string vers /admin/finances qui
 * déclenche un re-render server.
 *
 * Smart defaults pour la comparaison :
 *  - Ce mois / Mois dernier  → même mois l'an dernier
 *  - Année en cours          → année dernière
 *  - Custom                  → vide (admin choisit)
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type PresetKey =
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "year_to_date"
  | "last_year"
  | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "this_week", label: "Semaine en cours" },
  { key: "this_month", label: "Ce mois" },
  { key: "last_month", label: "Mois dernier" },
  { key: "last_3_months", label: "3 derniers mois" },
  { key: "year_to_date", label: "Année en cours" },
  { key: "last_year", label: "Année dernière" },
  { key: "custom", label: "Personnalisé" },
];

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(key: PresetKey, now: Date): { from: string; to: string } | null {
  if (key === "custom") return null;
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "this_week") {
    // Lundi 00:00 → lundi suivant 00:00 (ISO week, semaine commence lundi)
    const day = now.getDay(); // 0=dim, 1=lun, …, 6=sam
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(y, m, now.getDate() - daysSinceMonday);
    const nextMonday = new Date(monday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    return { from: toIsoDate(monday), to: toIsoDate(nextMonday) };
  }
  if (key === "this_month") {
    return {
      from: toIsoDate(new Date(y, m, 1)),
      to: toIsoDate(new Date(y, m + 1, 1)),
    };
  }
  if (key === "last_month") {
    return {
      from: toIsoDate(new Date(y, m - 1, 1)),
      to: toIsoDate(new Date(y, m, 1)),
    };
  }
  if (key === "last_3_months") {
    return {
      from: toIsoDate(new Date(y, m - 2, 1)),
      to: toIsoDate(new Date(y, m + 1, 1)),
    };
  }
  if (key === "year_to_date") {
    return {
      from: toIsoDate(new Date(y, 0, 1)),
      to: toIsoDate(new Date(y + 1, 0, 1)),
    };
  }
  if (key === "last_year") {
    return {
      from: toIsoDate(new Date(y - 1, 0, 1)),
      to: toIsoDate(new Date(y, 0, 1)),
    };
  }
  return null;
}

function defaultComparison(
  preset: PresetKey,
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (preset === "this_week") {
    // Comparer avec la semaine précédente (lun−7 → lun)
    const f = new Date(from);
    const t = new Date(to);
    const fPrev = new Date(f);
    fPrev.setDate(fPrev.getDate() - 7);
    const tPrev = new Date(t);
    tPrev.setDate(tPrev.getDate() - 7);
    return { from: toIsoDate(fPrev), to: toIsoDate(tPrev) };
  }
  if (preset === "this_month" || preset === "last_month") {
    const f = new Date(from);
    const t = new Date(to);
    return {
      from: toIsoDate(new Date(f.getFullYear() - 1, f.getMonth(), f.getDate())),
      to: toIsoDate(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate())),
    };
  }
  if (preset === "year_to_date") {
    const f = new Date(from);
    const t = new Date(to);
    return {
      from: toIsoDate(new Date(f.getFullYear() - 1, f.getMonth(), f.getDate())),
      to: toIsoDate(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate())),
    };
  }
  return null;
}

function detectPreset(from: string, to: string): PresetKey {
  const now = new Date();
  for (const p of PRESETS) {
    if (p.key === "custom") continue;
    const r = presetRange(p.key, now);
    if (r && r.from === from && r.to === to) return p.key;
  }
  return "custom";
}

type Props = {
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
};

export function PeriodSelector({
  from,
  to,
  compareFrom,
  compareTo,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const initialPreset = useMemo(() => detectPreset(from, to), [from, to]);

  const [preset, setPreset] = useState<PresetKey>(initialPreset);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [compareEnabled, setCompareEnabled] = useState<boolean>(
    Boolean(compareFrom && compareTo),
  );
  const [cmpFrom, setCmpFrom] = useState(compareFrom ?? "");
  const [cmpTo, setCmpTo] = useState(compareTo ?? "");
  const [busy, setBusy] = useState(false);

  function pushQuery(next: {
    from: string;
    to: string;
    compareFrom?: string | null;
    compareTo?: string | null;
  }) {
    const params = new URLSearchParams(sp.toString());
    params.set("from", next.from);
    params.set("to", next.to);
    if (next.compareFrom && next.compareTo) {
      params.set("compareFrom", next.compareFrom);
      params.set("compareTo", next.compareTo);
    } else {
      params.delete("compareFrom");
      params.delete("compareTo");
    }
    setBusy(true);
    router.push(`/admin/finances?${params.toString()}`);
    setTimeout(() => setBusy(false), 400);
  }

  function handlePresetClick(key: PresetKey) {
    setPreset(key);
    if (key === "custom") return;
    const r = presetRange(key, new Date());
    if (!r) return;
    setCustomFrom(r.from);
    setCustomTo(r.to);

    let nextCompare: { from: string; to: string } | null = null;
    if (compareEnabled) {
      const smart = defaultComparison(key, r.from, r.to);
      if (smart) {
        setCmpFrom(smart.from);
        setCmpTo(smart.to);
        nextCompare = smart;
      } else if (cmpFrom && cmpTo) {
        nextCompare = { from: cmpFrom, to: cmpTo };
      }
    }

    pushQuery({
      from: r.from,
      to: r.to,
      compareFrom: nextCompare?.from ?? null,
      compareTo: nextCompare?.to ?? null,
    });
  }

  function handleApplyCustom() {
    if (!customFrom || !customTo) return;
    if (customFrom >= customTo) return;
    pushQuery({
      from: customFrom,
      to: customTo,
      compareFrom: compareEnabled && cmpFrom && cmpTo ? cmpFrom : null,
      compareTo: compareEnabled && cmpFrom && cmpTo ? cmpTo : null,
    });
  }

  function handleToggleCompare(checked: boolean) {
    setCompareEnabled(checked);
    if (!checked) {
      pushQuery({ from, to, compareFrom: null, compareTo: null });
      return;
    }
    const smart = defaultComparison(preset, from, to);
    if (smart) {
      setCmpFrom(smart.from);
      setCmpTo(smart.to);
      pushQuery({
        from,
        to,
        compareFrom: smart.from,
        compareTo: smart.to,
      });
    }
  }

  function handleApplyCompare() {
    if (!cmpFrom || !cmpTo) return;
    if (cmpFrom >= cmpTo) return;
    pushQuery({
      from,
      to,
      compareFrom: cmpFrom,
      compareTo: cmpTo,
    });
  }

  return (
    <section
      aria-label="Sélecteur de période"
      className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePresetClick(p.key)}
              disabled={busy}
              className={`px-3 h-8 rounded-full text-xs uppercase tracking-[0.06em] transition-colors ${
                active
                  ? "bg-[var(--color-violet-600)] text-white"
                  : "bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <Field label="Du">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </Field>
          <Field label="Au">
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </Field>
          <button
            type="button"
            onClick={handleApplyCustom}
            disabled={busy || !customFrom || !customTo || customFrom >= customTo}
            className="h-9 px-4 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-700)] text-white hover:bg-[var(--color-violet-600)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Appliquer
          </button>
        </div>
      )}

      <div className="pt-1 border-t border-[var(--color-line)]">
        <label
          className="inline-flex items-center gap-2 mt-3 cursor-pointer"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={(e) => handleToggleCompare(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-violet-600)]"
          />
          <span className="text-sm text-[var(--color-ink-700)]">
            Comparer à une autre période
          </span>
        </label>

        {compareEnabled && (
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <Field label="Du">
              <input
                type="date"
                value={cmpFrom}
                onChange={(e) => setCmpFrom(e.target.value)}
                className="h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
                style={{ fontFamily: "var(--font-ui)" }}
              />
            </Field>
            <Field label="Au">
              <input
                type="date"
                value={cmpTo}
                onChange={(e) => setCmpTo(e.target.value)}
                className="h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
                style={{ fontFamily: "var(--font-ui)" }}
              />
            </Field>
            <button
              type="button"
              onClick={handleApplyCompare}
              disabled={busy || !cmpFrom || !cmpTo || cmpFrom >= cmpTo}
              className="h-9 px-4 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-300)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-100)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Comparer
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
