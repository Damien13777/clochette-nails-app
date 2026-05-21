/**
 * Helpers calendrier admin — manipulations de dates côté Europe/Paris.
 *
 * Convention :
 *  - `weekStartIso` = lundi de la semaine au format "YYYY-MM-DD"
 *  - Les heures sont en HH:MM Europe/Paris (le serveur tourne en Paris)
 *  - Pour les Dates Prisma stockées en @db.Date, on construit avec UTC midnight
 *    pour éviter les soucis de timezone.
 */

export const DAY_LABELS_SHORT_FR = [
  "Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam",
];
export const DAY_LABELS_FULL_FR = [
  "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
];

/** Retourne le lundi de la semaine contenant `date` (au format YYYY-MM-DD UTC). */
export function getMondayIso(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay(); // 0=Dim, 1=Lun, ..., 6=Sam
  const diff = day === 0 ? -6 : 1 - day; // Si dimanche → recule de 6 jours
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Convertit "YYYY-MM-DD" en Date UTC midnight (compatible @db.Date). */
export function isoToUtcDate(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

/** Ajoute `n` jours à un ISO date string et retourne le résultat. */
export function addDaysIso(iso: string, n: number): string {
  const d = isoToUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Retourne les 7 dates ISO (lun → dim) de la semaine commençant à `mondayIso`. */
export function weekDaysIso(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(mondayIso, i));
}

/** Formate "YYYY-MM-DD" en "Lun 20 mai". */
export function formatDayShortFr(iso: string): string {
  const d = isoToUtcDate(iso);
  const day = DAY_LABELS_SHORT_FR[d.getUTCDay()];
  const date = d.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
  return `${day} ${date}`;
}

/** Formate l'intervalle de la semaine : "20 — 26 mai 2026". */
export function formatWeekRangeFr(mondayIso: string): string {
  const start = isoToUtcDate(mondayIso);
  const end = isoToUtcDate(addDaysIso(mondayIso, 6));
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startStr = start.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    ...(sameMonth && sameYear ? {} : { month: "short" }),
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endStr = end.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${startStr} — ${endStr}`;
}

/** Compare 2 horaires "HH:MM" : a < b */
export function timeLt(a: string, b: string): boolean {
  return a < b;
}

/** Retourne true si `time` ∈ [start, end[. */
export function timeInRange(time: string, start: string, end: string): boolean {
  return time >= start && time < end;
}

/** Convertit "HH:MM" → minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convertit minutes → "HH:MM". */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Génère la liste des slots HH:MM entre 00:00 et 23:59 selon la granularité.
 * Utilisé pour la grille semaine — chaque entrée = 1 ligne de la grille.
 */
export function generateDaySlots(
  granularityMinutes: number,
  startHour = 0,
  endHour = 24,
): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += granularityMinutes) {
      slots.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  }
  return slots;
}

/**
 * Pour le rendu visuel : détermine la plage horaire à afficher pour la semaine
 * en fonction des horaires d'ouverture des 7 jours + bookings + indispos.
 * Évite d'afficher tout 00h-24h si le salon n'ouvre que 9h-19h.
 */
export function computeVisibleHourRange(
  businessHours: { dayOfWeek: number; isOpen: boolean; openingTime: string | null; closingTime: string | null }[],
  bookings: { startTime: string; endTime: string }[],
  unavailabilities: { startsAt: Date; endsAt: Date }[],
  weekStartIso: string,
): { startHour: number; endHour: number } {
  let minMin = 9 * 60; // défaut 9h
  let maxMin = 19 * 60; // défaut 19h

  for (const bh of businessHours) {
    if (bh.isOpen && bh.openingTime && bh.closingTime) {
      minMin = Math.min(minMin, timeToMinutes(bh.openingTime));
      maxMin = Math.max(maxMin, timeToMinutes(bh.closingTime));
    }
  }
  for (const b of bookings) {
    minMin = Math.min(minMin, timeToMinutes(b.startTime));
    maxMin = Math.max(maxMin, timeToMinutes(b.endTime));
  }
  const weekStart = isoToUtcDate(weekStartIso).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  for (const u of unavailabilities) {
    const uStart = u.startsAt.getTime();
    const uEnd = u.endsAt.getTime();
    if (uEnd > weekStart && uStart < weekEnd) {
      const sM = u.startsAt.getUTCHours() * 60 + u.startsAt.getUTCMinutes();
      const eM = u.endsAt.getUTCHours() * 60 + u.endsAt.getUTCMinutes();
      // Si l'indispo s'étend sur plusieurs jours, on prend 0h-23h59
      const sameDay =
        u.startsAt.getUTCFullYear() === u.endsAt.getUTCFullYear() &&
        u.startsAt.getUTCMonth() === u.endsAt.getUTCMonth() &&
        u.startsAt.getUTCDate() === u.endsAt.getUTCDate();
      if (sameDay) {
        minMin = Math.min(minMin, sM);
        maxMin = Math.max(maxMin, eM);
      }
    }
  }

  // Arrondi à l'heure pleine pour propreté visuelle
  const startHour = Math.max(0, Math.floor(minMin / 60));
  const endHour = Math.min(24, Math.ceil(maxMin / 60));
  return { startHour, endHour };
}

/** Palette de couleurs par catégorie de service (utilisée dans la grille). */
export const SERVICE_CATEGORY_COLORS: Record<
  string,
  { bg: string; border: string; text: string; label: string }
> = {
  POSE_NATURELS: {
    bg: "#f5f0ff",
    border: "#a78bda",
    text: "#553c9a",
    label: "Pose ongles naturels",
  },
  RALLONGEMENT: {
    bg: "#fce7f3",
    border: "#ec4899",
    text: "#9d174d",
    label: "Rallongement",
  },
  PACK_SPECIAL: {
    bg: "#ffedd5",
    border: "#fb923c",
    text: "#9a3412",
    label: "Pack spécial",
  },
  SOIN_MAINS: {
    bg: "#d1fae5",
    border: "#34d399",
    text: "#065f46",
    label: "Soin des mains",
  },
  SOIN_PIEDS: {
    bg: "#cffafe",
    border: "#22d3ee",
    text: "#155e75",
    label: "Soin des pieds",
  },
};

export function colorForCategory(category: string) {
  return (
    SERVICE_CATEGORY_COLORS[category] ?? {
      bg: "#f5f5f4",
      border: "#a8a29e",
      text: "#44403c",
      label: category,
    }
  );
}
