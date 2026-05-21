"use client";

/**
 * Bande de sélection de jour pour mobile.
 *
 * Affiche les 7 jours de la semaine, chacun avec :
 *  - Jour court (Lun, Mar, …)
 *  - Numéro de date
 *  - Dots = nombre de bookings (max 3 dots, sinon "4+")
 *  - Pastille grise discrète si jour fermé
 *  - Icône bleue si jour comporte des indispos
 *  - Soulignement subtil pour "aujourd'hui"
 *  - Fond violet plein quand sélectionné
 *
 * Swipe horizontal pour naviguer entre semaines (gauche → suivante, droite → précédente).
 */

import { useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DAY_LABELS_SHORT_FR,
  addDaysIso,
  weekDaysIso,
} from "@/lib/calendar";

type DayData = {
  iso: string;
  bookingsCount: number;
  isClosed: boolean;
  hasUnavail: boolean;
};

type Props = {
  weekStartIso: string;
  selectedDayIso: string;
  daysData: DayData[]; // 7 entries dans l'ordre Lun → Dim
  todayIso: string;
};

// Seuil et stricteurs pour éviter les faux-positifs (scroll page mal interprété).
// Mouvement horizontal doit être > 80px ET au moins 2x supérieur au vertical.
const SWIPE_THRESHOLD_PX = 80;
const HORIZONTAL_DOMINANCE = 2;

export function MobileWeekSelector({
  weekStartIso,
  selectedDayIso,
  daysData,
  todayIso,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const days = weekDaysIso(weekStartIso);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function hrefForDay(dayIso: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("day", dayIso);
    params.set("week", weekStartIso);
    return `/admin/calendrier?${params.toString()}`;
  }

  function gotoWeek(direction: -1 | 1) {
    const newWeekIso = addDaysIso(weekStartIso, direction * 7);
    // Reste sur le même jour de semaine si possible (sinon retombe sur lundi)
    const newSelected = addDaysIso(newWeekIso, days.indexOf(selectedDayIso));
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", newWeekIso);
    params.set("day", newSelected);
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
    // Strict : horizontal doit dominer fortement le vertical
    if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    gotoWeek(dx > 0 ? -1 : 1);
  }

  return (
    <div
      className="grid grid-cols-7 gap-1 p-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] select-none"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="group"
      aria-label="Jours de la semaine"
    >
      {days.map((dayIso, i) => {
        const data = daysData[i];
        const isSelected = dayIso === selectedDayIso;
        const isToday = dayIso === todayIso;
        const date = new Date(dayIso + "T00:00:00Z");
        const dow = date.getUTCDay();
        return (
          <Link
            key={dayIso}
            href={hrefForDay(dayIso)}
            scroll={false}
            className={`flex flex-col items-center gap-1.5 pt-2 pb-3 px-0.5 rounded-[var(--radius-sm)] transition-colors min-h-[84px] ${
              isSelected
                ? "bg-[var(--color-violet-600)] text-white"
                : data.isClosed
                  ? "text-[var(--color-ink-500)] opacity-70"
                  : "text-[var(--color-ink-900)] hover:bg-[var(--color-bone)]"
            }`}
            aria-current={isSelected ? "date" : undefined}
          >
            <span
              className="text-[10px] uppercase tracking-[0.08em] opacity-90"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {DAY_LABELS_SHORT_FR[dow]}
            </span>
            <span
              className={`text-lg leading-none ${isToday ? "underline underline-offset-4 decoration-2" : ""}`}
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {date.getUTCDate()}
            </span>
            <Dots
              count={data.bookingsCount}
              hasUnavail={data.hasUnavail}
              isClosed={data.isClosed}
              isSelected={isSelected}
            />
          </Link>
        );
      })}
    </div>
  );
}

function Dots({
  count,
  hasUnavail,
  isClosed,
  isSelected,
}: {
  count: number;
  hasUnavail: boolean;
  isClosed: boolean;
  isSelected: boolean;
}) {
  if (isClosed) {
    return (
      <span
        className={`block w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/60" : "bg-[var(--color-ink-300)]"}`}
        aria-label="Fermé"
      />
    );
  }

  if (count === 0 && !hasUnavail) {
    return <span className="block h-1.5" aria-hidden />;
  }

  const dotColor = isSelected ? "bg-white" : "bg-[var(--color-violet-600)]";
  const unavailColor = isSelected ? "bg-white/70" : "bg-[#3b82f6]";

  return (
    <span className="flex items-center gap-1 h-2">
      {hasUnavail && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${unavailColor}`}
          aria-label="Indisponibilité"
        />
      )}
      {count > 0 && count <= 3 ? (
        Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`}
            aria-hidden
          />
        ))
      ) : count > 3 ? (
        <span
          className={`text-[10px] leading-none font-semibold ${isSelected ? "text-white" : "text-[var(--color-violet-700)]"}`}
          style={{ fontFamily: "var(--font-display)" }}
          aria-label={`${count} rendez-vous`}
        >
          {count}
        </span>
      ) : null}
    </span>
  );
}
