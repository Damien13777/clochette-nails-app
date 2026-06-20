"use client";

/**
 * Indicateur "Maintenant" pour le calendrier — ligne horizontale rouge
 * + badge HH:MM positionnés sur la timeline du jour courant.
 *
 * Auto-refresh chaque minute via setInterval.
 * Calcule la position en pixels d'après startHour + granularity + SLOT_HEIGHT_PX.
 *
 * Affiché uniquement si l'heure courante est dans la plage visible (startHour → endHour).
 */

import { useEffect, useState } from "react";

type Props = {
  /** Heure de début visible (offset en heures depuis minuit) */
  startHour: number;
  /** Heure de fin visible */
  endHour: number;
  /** Granularité de la grille en minutes */
  granularity: number;
  /** Hauteur d'un slot en pixels */
  slotHeightPx: number;
  /** Si true, affiche le badge HH:MM à droite de la ligne */
  withLabel?: boolean;
};

export function NowIndicator({
  startHour,
  endHour,
  granularity,
  slotHeightPx,
  withLabel = true,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    function tick() {
      setNow(new Date());
    }
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const minutesFromStart = now.getHours() * 60 + now.getMinutes() - startHour * 60;
  const minutesVisible = (endHour - startHour) * 60;

  if (minutesFromStart < 0 || minutesFromStart > minutesVisible) return null;

  const top = minutesFromStart * (slotHeightPx / granularity);
  const label = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
      style={{ top: `${top}px` }}
      aria-label={`Heure actuelle ${label}`}
    >
      <span className="block w-2 h-2 -ml-1 rounded-full bg-[#e11d48] shadow-sm shrink-0" />
      <span className="flex-1 h-[2px] bg-[#e11d48]/80" />
      {withLabel && (
        <span
          className="ml-1 mr-1 px-1.5 py-0.5 rounded-full bg-[#e11d48] text-white text-[10px] font-medium leading-none shadow-sm shrink-0"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
