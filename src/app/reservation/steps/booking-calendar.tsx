"use client";

/**
 * Step 3 — Calendrier + slots horaires.
 *
 * Sélecteur mois (prev/next) + grid 7×N de jours.
 * - Mois non ouvert (BookableMonth absent) → message dédié
 * - Jours dans le passé → grisés/désactivés
 * - Jours structurellement fermés (BusinessHours hebdo + DayException,
 *   calculés serveur dans page.tsx via closed-days.ts) → grisés/désactivés,
 *   la cliente ne découvre plus la fermeture par essai-erreur
 * - Tap sur un jour ouvert → fetch /api/v1/availability/slots → chips horaires
 *   (un jour ouvert mais complet affiche « aucun créneau », message distinct)
 */

import { useEffect, useMemo, useState } from "react";
import { isDayClosed, type ClosedDayData } from "@/lib/closed-days";

type Props = {
  serviceId: string;
  optionIds: string[];
  bookableMonths: { year: number; month: number }[];
  closedDays: ClosedDayData;
  onPick: (date: string, startTime: string) => void;
};

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"]; // Lun-Dim

export function BookingCalendar({ serviceId, optionIds, bookableMonths, closedDays, onPick }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Cursor mois affiché : on démarre sur le premier mois bookable >= aujourd'hui
  const initialCursor = useMemo(() => {
    const todayKey = (d: Date) => d.getFullYear() * 100 + d.getMonth() + 1;
    const target = todayKey(today);
    const sorted = [...bookableMonths].sort(
      (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
    );
    const found = sorted.find((bm) => bm.year * 100 + bm.month >= target);
    if (found) return { year: found.year, month: found.month };
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }, [today, bookableMonths]);

  const [cursor, setCursor] = useState(initialCursor);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsReason, setSlotsReason] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Map "YYYY-MM" → boolean (mois ouvert ?)
  const isBookableMonth = (year: number, month: number) =>
    bookableMonths.some((bm) => bm.year === year && bm.month === month);

  function goPrev() {
    setCursor((c) => {
      const m = c.month - 1;
      return m < 1 ? { year: c.year - 1, month: 12 } : { ...c, month: m };
    });
    setSelectedDate(null);
    setSlots(null);
    setSlotsReason(null);
  }

  function goNext() {
    setCursor((c) => {
      const m = c.month + 1;
      return m > 12 ? { year: c.year + 1, month: 1 } : { ...c, month: m };
    });
    setSelectedDate(null);
    setSlots(null);
    setSlotsReason(null);
  }

  // Fetch slots quand selectedDate change
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effet de fetch des créneaux au changement de date
    setLoadingSlots(true);
    setSlots(null);
    setSlotsReason(null);

    const params = new URLSearchParams({
      date: selectedDate,
      serviceId,
    });
    if (optionIds.length > 0) {
      params.set("optionIds", optionIds.join(","));
    }

    fetch(`/api/v1/availability/slots?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.slots) {
          setSlots(data.slots);
          setSlotsReason(data.reason ?? null);
        } else {
          setSlots([]);
          setSlotsReason(data.code ?? "ERROR");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
        setSlotsReason("NETWORK");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate, serviceId, optionIds]);

  // Calcule la grid de jours du mois
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  const monthBookable = isBookableMonth(cursor.year, cursor.month);
  const monthLabel = `${MONTH_NAMES[cursor.month - 1]} ${cursor.year}`;

  return (
    <div className="space-y-5 pt-4">
      {/* Navigation mois */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Mois précédent"
          className="w-10 h-10 grid place-items-center rounded-full hover:bg-[var(--color-violet-50)] text-[var(--color-ink-700)] transition-colors"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span
          className="text-lg capitalize"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goNext}
          aria-label="Mois suivant"
          className="w-10 h-10 grid place-items-center rounded-full hover:bg-[var(--color-violet-50)] text-[var(--color-ink-700)] transition-colors"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Grid jours */}
      {!monthBookable && (
        <p
          className="text-sm text-center text-[var(--color-ink-500)] py-6"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Ce mois n&apos;est pas encore ouvert à la réservation.
        </p>
      )}

      {monthBookable && (
        <div role="grid" aria-label={`Calendrier ${monthLabel}`}>
          {/* Headers jours */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
                role="columnheader"
                className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] text-center py-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, idx) => {
              if (!cell) {
                return <div key={idx} />;
              }
              const isPast = cell.date < today;
              const dateStr = formatDateKey(cell.date);
              const isClosed = isDayClosed(dateStr, cell.date.getDay(), closedDays);
              const isSelected = selectedDate === dateStr;
              const disabled = isPast || isClosed;

              return (
                <button
                  key={idx}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  disabled={disabled}
                  title={!isPast && isClosed ? "Salon fermé" : undefined}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`aspect-square text-sm rounded-[var(--radius-sm)] transition-all ${
                    isSelected
                      ? "bg-[var(--color-violet-600)] text-white"
                      : disabled
                      ? "text-[var(--color-ink-300)] cursor-not-allowed"
                      : "hover:bg-[var(--color-violet-50)] text-[var(--color-ink-900)]"
                  }`}
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Slots horaires */}
      {selectedDate && (
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Créneaux disponibles · {formatDateFr(new Date(selectedDate))}
          </p>

          {loadingSlots && (
            <p
              className="text-sm text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Chargement…
            </p>
          )}

          {!loadingSlots && slots && slots.length === 0 && (
            <p
              className="text-sm text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {slotsReason === "DAY_CLOSED"
                ? "Salon fermé ce jour-là."
                : slotsReason === "MONTH_NOT_OPEN"
                ? "Mois non ouvert."
                : slotsReason === "PAST_DATE"
                ? "Date passée."
                : "Aucun créneau disponible ce jour. Essayez une autre date."}
            </p>
          )}

          {!loadingSlots && slots && slots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {slots.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => onPick(selectedDate, time)}
                  className="px-4 py-2 rounded-full bg-[var(--color-paper)] border border-[var(--color-line)] text-sm hover:border-[var(--color-violet-600)] hover:bg-[var(--color-violet-50)] hover:text-[var(--color-violet-700)] transition-all"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Construit la grid d'un mois : 7 colonnes Lun-Dim, lignes selon # de semaines.
 * Retourne un array où chaque element est null (case vide) ou { date, day }.
 */
function buildMonthGrid(
  year: number,
  month: number,
): Array<{ date: Date; day: number } | null> {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0); // Dernier jour du mois

  // jsDay: 0=Dim, 1=Lun, ..., 6=Sam → on veut Lun=0, Dim=6
  const firstDay = (firstOfMonth.getDay() + 6) % 7;

  const cells: Array<{ date: Date; day: number } | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);

  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    const date = new Date(year, month - 1, d);
    date.setHours(0, 0, 0, 0);
    cells.push({ date, day: d });
  }

  // Remplir le reste pour completer la dernière semaine
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
