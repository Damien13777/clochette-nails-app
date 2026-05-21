"use client";

/**
 * Header sticky du calendrier avec :
 *  - Titre + plage de dates de la semaine
 *  - Boutons « ← » / « Aujourd'hui » / « → »
 *  - Switcher granularité (15 / 30 / 60 min)
 *  - Bouton "Gérer" (ouvre panneau latéral RecurringUnavail + BookableMonth)
 *
 * Navigation via Link/router : on push juste la searchParam `week` et `g`.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDaysIso,
  formatWeekRangeFr,
  getMondayIso,
  isoToUtcDate,
} from "@/lib/calendar";
import { mondayIsoForTodayParis, todayIsoParis } from "@/lib/paris-day";

const MONTH_LABELS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * En vue mois, weekStartIso peut être un lundi de fin du mois précédent
 * (bordure de la grille mensuelle). On prend +7 jours pour avoir une date
 * qui tombe toujours dans le mois réellement affiché.
 */
function monthAnchorFor(weekStartIso: string): Date {
  const d = isoToUtcDate(weekStartIso);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

function formatMonthYearFr(weekStartIso: string): string {
  const d = monthAnchorFor(weekStartIso);
  return `${MONTH_LABELS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Retourne le lundi de la grille du mois précédent ou suivant. */
function jumpMonth(weekStartIso: string, direction: -1 | 1): string {
  const d = monthAnchorFor(weekStartIso);
  d.setUTCDate(1); // 1er du mois affiché
  d.setUTCMonth(d.getUTCMonth() + direction);
  // Retourne le lundi qui contient ce 1er (peut être dans le mois précédent)
  return getMondayIso(d);
}
import { CalendarSidePanel } from "./calendar-side-panel";

type BookableMonth = { year: number; month: number; isOpen: boolean };
type RecurringUnav = {
  id: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  startsFrom: string;
  endsAt: string | null;
  reason: string | null;
};
type UpcomingUnav = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export function CalendarHeader({
  weekStartIso,
  granularity,
  view,
  selectedDayIso,
  bookableMonths,
  recurringUnavails,
  upcomingUnavails,
}: {
  weekStartIso: string;
  granularity: number;
  view: "week" | "month";
  /** Si défini (vue mobile), le bouton "Aujourd'hui" devient actif uniquement
   * si le jour sélectionné est today. Sinon (desktop), basé sur la semaine. */
  selectedDayIso?: string;
  /** Data pour le panneau latéral "Gérer" */
  bookableMonths: BookableMonth[];
  recurringUnavails: RecurringUnav[];
  upcomingUnavails: UpcomingUnav[];
}) {
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  function hrefForWeek(weekIso: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", weekIso);
    return `/admin/calendrier?${params.toString()}`;
  }

  /** Bouton "Aujourd'hui" : reset à la fois la semaine ET le jour sélectionné. */
  function hrefForToday(): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", todayMondayIso);
    params.set("day", todayIso);
    return `/admin/calendrier?${params.toString()}`;
  }

  function changeGranularity(g: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("g", String(g));
    router.push(`/admin/calendrier?${params.toString()}`);
  }

  function changeView(v: "week" | "month") {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "week") params.delete("view");
    else params.set("view", v);
    router.push(`/admin/calendrier?${params.toString()}`);
  }

  const todayIso = todayIsoParis();
  const todayMondayIso = mondayIsoForTodayParis();
  const isCurrentWeek = weekStartIso === todayMondayIso;
  // Sur mobile (selectedDayIso fourni) → actif uniquement si jour = today.
  // Sur desktop (pas de selectedDayIso) → actif si semaine = semaine courante.
  const isOnToday = selectedDayIso
    ? isCurrentWeek && selectedDayIso === todayIso
    : isCurrentWeek;

  return (
    <header className="sticky top-16 z-20 -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 mb-6 bg-[var(--color-cream)]/95 backdrop-blur-md border-b border-[var(--color-line)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pilotage planning
          </p>
          <h1
            className="mt-2 text-[clamp(1.4rem,2.5vw,1.8rem)] capitalize"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {view === "month"
              ? formatMonthYearFr(weekStartIso)
              : formatWeekRangeFr(weekStartIso)}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bouton Gérer (ouvre panneau latéral) */}
          <button
            type="button"
            onClick={() => setSidePanelOpen(true)}
            aria-label="Gérer le calendrier"
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] text-[11px] uppercase tracking-[0.06em] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="hidden sm:inline">Gérer</span>
          </button>

          {/* Toggle Semaine / Mois */}
          <div
            className="inline-flex items-center gap-0.5 p-0.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full"
            role="group"
            aria-label="Vue calendrier"
          >
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
                  view === v
                    ? "bg-[var(--color-violet-600)] text-white"
                    : "text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                }`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {v === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>

          {/* Granularité (uniquement en vue semaine) */}
          {view === "week" && <div
            className="inline-flex items-center gap-0.5 p-0.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full"
            role="group"
            aria-label="Granularité d'affichage"
          >
            {[15, 30, 60].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => changeGranularity(g)}
                aria-pressed={granularity === g}
                className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
                  granularity === g
                    ? "bg-[var(--color-violet-600)] text-white"
                    : "text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                }`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {g} min
              </button>
            ))}
          </div>}

          {/* Navigation semaine/mois */}
          <div className="inline-flex items-center gap-1.5">
            <Link
              href={hrefForWeek(
                view === "month"
                  ? jumpMonth(weekStartIso, -1)
                  : addDaysIso(weekStartIso, -7),
              )}
              aria-label="Semaine précédente"
              className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <Link
              href={hrefForToday()}
              aria-current={isOnToday ? "page" : undefined}
              className={`px-4 h-9 inline-flex items-center justify-center rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
                isOnToday
                  ? "bg-[var(--color-violet-600)] text-white"
                  : "border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              Aujourd&apos;hui
            </Link>
            <Link
              href={hrefForWeek(
                view === "month"
                  ? jumpMonth(weekStartIso, 1)
                  : addDaysIso(weekStartIso, 7),
              )}
              aria-label="Semaine suivante"
              className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {sidePanelOpen && (
        <CalendarSidePanel
          bookableMonths={bookableMonths}
          recurringUnavails={recurringUnavails}
          upcomingUnavails={upcomingUnavails}
          onClose={() => setSidePanelOpen(false)}
        />
      )}
    </header>
  );
}
