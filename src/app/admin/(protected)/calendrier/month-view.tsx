"use client";

/**
 * Vue Mois du calendrier admin.
 *
 * Grille 7 colonnes × 6 lignes (42 jours) qui couvre tout le mois affiché
 * + bordures du mois précédent/suivant pour avoir une grille complète.
 *
 * Chaque cellule jour affiche :
 *  - Numéro de jour
 *  - Dots = count de bookings (max 3 dots, sinon "X+")
 *  - Badge "Excep." mini si DayException
 *  - Petit point bleu si indispo (one-off ou récurrente)
 *  - Style spécial : aujourd'hui (fond violet clair), jour hors mois (grisé),
 *    jour fermé (pastille grise), jour avec mois non bookable (asterisque)
 *
 * Clic sur une cellule → bascule en vue semaine de ce jour.
 */

import { useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DAY_LABELS_SHORT_FR,
  addDaysIso,
  getMondayIso,
  isoToUtcDate,
  weekDaysIso,
} from "@/lib/calendar";

const SWIPE_THRESHOLD_PX = 80;
const HORIZONTAL_DOMINANCE = 2;

type BookingLite = {
  id: string;
  dateIso: string;
  status: string;
  serviceCategory: string;
};

type UnavailLite = {
  id: string;
  startsAt: string; // ISO
  endsAt: string;
};

type DayException = {
  dateIso: string;
  isOpen: boolean;
};

type RecurringUnav = {
  id: string;
  dayOfWeek: number;
  startsFromIso: string;
  endsAtIso: string | null;
};

type BusinessHours = {
  dayOfWeek: number;
  isOpen: boolean;
};

type Props = {
  /** Semaine d'ancrage — on en déduit le mois à afficher */
  weekStartIso: string;
  /** Aujourd'hui ISO (calculé serveur pour cohérence) */
  todayIso: string;
  bookings: BookingLite[];
  unavailabilities: UnavailLite[];
  dayExceptions: DayException[];
  recurringUnavails: RecurringUnav[];
  businessHours: BusinessHours[];
  /** Mois ouverts à la résa publique (set de "YYYY-M") */
  bookableMonthsSet: Set<string>;
};

const MONTH_LABELS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function MonthView({
  weekStartIso,
  todayIso,
  bookings,
  unavailabilities,
  dayExceptions,
  recurringUnavails,
  businessHours,
  bookableMonthsSet,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // weekStartIso peut être un lundi de fin du mois précédent (bordure grille
  // mensuelle) → on décale de +7 jours pour avoir une date sûre dans le mois
  // réellement affiché.
  const anchor = isoToUtcDate(weekStartIso);
  anchor.setUTCDate(anchor.getUTCDate() + 7);
  const year = anchor.getUTCFullYear();
  const monthIndex = anchor.getUTCMonth(); // 0-11

  function jumpMonth(direction: -1 | 1): string {
    const d = isoToUtcDate(weekStartIso);
    d.setUTCDate(d.getUTCDate() + 7);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + direction);
    return getMondayIso(d);
  }

  function gotoMonth(direction: -1 | 1) {
    const newWeekIso = jumpMonth(direction);
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", newWeekIso);
    params.set("view", "month");
    router.push(`/admin/calendrier?${params.toString()}`);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    gotoMonth(dx > 0 ? -1 : 1);
  }

  // Premier lundi de la grille (peut être dans le mois précédent)
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const gridStartIso = getMondayIso(firstOfMonth);

  // 6 semaines × 7 jours = 42 cellules
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(addDaysIso(gridStartIso, i));
  }

  // Index pour lookup rapide
  const bookingsByDay = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === "CONFIRMED" || b.status === "AWAITING_DEPOSIT") {
      bookingsByDay.set(b.dateIso, (bookingsByDay.get(b.dateIso) ?? 0) + 1);
    }
  }
  const exceptionsByDay = new Map<string, DayException>();
  for (const e of dayExceptions) exceptionsByDay.set(e.dateIso, e);

  function hasUnavailOnDay(dayIso: string): boolean {
    const dayStart = new Date(dayIso + "T00:00:00");
    const dayEnd = new Date(dayIso + "T23:59:59");
    return unavailabilities.some(
      (u) =>
        new Date(u.endsAt) > dayStart && new Date(u.startsAt) < dayEnd,
    );
  }

  function hasRecurringOnDay(dayIso: string): boolean {
    const dow = isoToUtcDate(dayIso).getUTCDay();
    return recurringUnavails.some(
      (r) =>
        r.dayOfWeek === dow &&
        r.startsFromIso <= dayIso &&
        (r.endsAtIso === null || dayIso <= r.endsAtIso),
    );
  }

  function isDayClosed(dayIso: string): boolean {
    const exception = exceptionsByDay.get(dayIso);
    if (exception) return !exception.isOpen;
    const dow = isoToUtcDate(dayIso).getUTCDay();
    const bh = businessHours.find((b) => b.dayOfWeek === dow);
    return !bh || !bh.isOpen;
  }

  function hrefForDay(dayIso: string): string {
    // Bascule en vue semaine
    const mondayIso = getMondayIso(isoToUtcDate(dayIso));
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", mondayIso);
    params.set("day", dayIso); // pour la vue mobile
    params.delete("view"); // retour à week
    return `/admin/calendrier?${params.toString()}`;
  }

  return (
    <div
      className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden select-none"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* En-têtes jours de la semaine */}
      <div className="grid grid-cols-7 border-b border-[var(--color-line)] bg-[var(--color-bone)]">
        {weekDaysIso(gridStartIso).slice(0, 7).map((iso, i) => {
          const dow = isoToUtcDate(iso).getUTCDay();
          return (
            <div
              key={i}
              className="px-2 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] text-center"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {DAY_LABELS_SHORT_FR[dow]}
            </div>
          );
        })}
      </div>

      {/* Grille 6 × 7 */}
      <div className="grid grid-cols-7 grid-rows-6">
        {cells.map((dayIso) => {
          const d = isoToUtcDate(dayIso);
          const isCurrentMonth = d.getUTCMonth() === monthIndex;
          const isToday = dayIso === todayIso;
          const bookingsCount = bookingsByDay.get(dayIso) ?? 0;
          const exception = exceptionsByDay.get(dayIso);
          const isClosed = isDayClosed(dayIso);
          const hasUnavail = hasUnavailOnDay(dayIso);
          const hasRecurring = hasRecurringOnDay(dayIso);

          const monthKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
          const isBookableMonth = bookableMonthsSet.has(monthKey);

          return (
            <Link
              key={dayIso}
              href={hrefForDay(dayIso)}
              className={`group min-h-[88px] sm:min-h-[110px] border-r border-b border-[var(--color-line)] last:border-r-0 p-2 transition-colors flex flex-col gap-1 ${
                isCurrentMonth
                  ? isToday
                    ? "bg-[var(--color-violet-50)] hover:bg-[var(--color-violet-50)]/80"
                    : "bg-[var(--color-paper)] hover:bg-[var(--color-bone)]/50"
                  : "bg-[var(--color-bone)]/30 hover:bg-[var(--color-bone)]/50"
              }`}
            >
              {/* Top : numéro de jour + badges */}
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`text-sm leading-none ${
                    isCurrentMonth
                      ? isToday
                        ? "text-[var(--color-violet-700)] font-medium"
                        : "text-[var(--color-ink-900)]"
                      : "text-[var(--color-ink-300)]"
                  }`}
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {d.getUTCDate()}
                </span>
                {exception && (
                  <span
                    className="inline-block px-1 py-px rounded-full bg-[#fff4e0] text-[#b3651e] border border-[#f0d6a0] text-[8px] uppercase tracking-[0.06em] leading-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                    title={
                      exception.isOpen
                        ? "Ouverture exceptionnelle"
                        : "Fermeture exceptionnelle"
                    }
                  >
                    Excep.
                  </span>
                )}
              </div>

              {/* Bas : indicateurs */}
              <div className="mt-auto flex items-center gap-1.5 min-h-[14px] flex-wrap">
                {/* Jour fermé : pastille grise discrète */}
                {isClosed && bookingsCount === 0 && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-300)]"
                    title="Salon fermé"
                  />
                )}
                {/* Bookings : dots violets ou compteur */}
                {bookingsCount > 0 && (
                  <span className="flex items-center gap-1">
                    {bookingsCount <= 3 ? (
                      Array.from({ length: bookingsCount }).map((_, i) => (
                        <span
                          key={i}
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-violet-600)]"
                        />
                      ))
                    ) : (
                      <span
                        className="text-[10px] font-semibold text-[var(--color-violet-700)] leading-none"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {bookingsCount} RDV
                      </span>
                    )}
                  </span>
                )}
                {/* Indispo (one-off ou récurrente) */}
                {(hasUnavail || hasRecurring) && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-[#3b82f6]"
                    title={
                      hasUnavail
                        ? "Indisponibilité ce jour"
                        : "Indispo récurrente"
                    }
                  />
                )}
              </div>

              {/* Bordure subtile pour mois non bookable (résa publique fermée) */}
              {!isBookableMonth && isCurrentMonth && (
                <span
                  className="absolute top-1 left-1 text-[9px] text-[var(--color-ink-300)] hidden"
                  aria-hidden
                  title="Mois fermé à la résa publique"
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Légende */}
      <div
        className="px-4 py-3 border-t border-[var(--color-line)] bg-[var(--color-bone)]/40 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-violet-600)]" />
          RDV
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
          Indispo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-300)]" />
          Fermé
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block px-1 py-px rounded-full bg-[#fff4e0] text-[#b3651e] border border-[#f0d6a0] text-[9px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Excep.
          </span>
          Horaires exceptionnels
        </span>
        <span
          className="ml-auto text-[10px] text-[var(--color-ink-500)]"
        >
          {MONTH_LABELS_FR[monthIndex]} {year} · clic sur un jour pour voir le détail
        </span>
      </div>
    </div>
  );
}
