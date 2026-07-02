/**
 * Algorithme de calcul des disponibilités — Clochette Nails.
 *
 * Pour une date donnée + une durée de prestation requise, retourne
 * les heures de début possibles, en respectant :
 *  1. BookableMonth ouvert pour ce mois (sinon : aucune dispo)
 *  2. BusinessHours du jour de la semaine (jour fermé → aucune dispo)
 *  3. Pause déjeuner si définie
 *  4. Unavailability ponctuelles overlap
 *  5. RecurringUnavailability pour ce dayOfWeek
 *  6. Bookings actives (status AWAITING_DEPOSIT ou CONFIRMED) overlap
 *  7. Granularité (default 30 min)
 *
 * Heures manipulées en string "HH:MM" Europe/Paris (cohérent avec le schema).
 *
 * ⚠ Unavailability.startsAt/endsAt sont des instants ABSOLUS (DateTime), pas de
 * l'heure-mur. On les convertit en minutes-mur Paris (parisMinutesSinceMidnight)
 * avant de les comparer aux créneaux, sinon décalage de l'offset UTC (2h l'été) :
 * une indispo 08:00→10:00 saisie par l'admin bloquerait 06:00→08:00 → avant
 * l'ouverture → aucun effet, et les clientes réservent par-dessus.
 */

import { prisma } from "@/lib/prisma";
import {
  currentTimeHHMMParis,
  nextIsoDate,
  parisWallClockToUtc,
  startOfTodayParisAsUtc,
  todayIsoParis,
  unavailabilityToParisRange,
} from "@/lib/paris-day";

// ── Helpers temporels (string HH:MM) ──────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ── API publique ──────────────────────────────────────────

export type AvailabilityInput = {
  /** ISO date "YYYY-MM-DD" */
  date: string;
  /** Durée totale en minutes (service + options) */
  totalDurationMinutes: number;
  /**
   * ID de booking à exclure du calcul des overlaps.
   * Utile quand on déplace un RDV : le créneau actuel ne doit pas se bloquer
   * lui-même dans la liste des dispos.
   */
  excludeBookingId?: string;
};

export type AvailabilityResult = {
  /** Si false, indique pourquoi (mois fermé, jour fermé...) */
  reason?:
    | "MONTH_NOT_OPEN"
    | "DAY_CLOSED"
    | "PAST_DATE"
    | "NO_BUSINESS_HOURS_CONFIG";
  /** Liste des heures de début possibles ("HH:MM") */
  slots: string[];
};

/**
 * Calcule les créneaux disponibles pour une date + durée donnée.
 */
export async function computeAvailableSlots(
  input: AvailabilityInput,
): Promise<AvailabilityResult> {
  const date = new Date(input.date + "T00:00:00Z");

  // 0. Date passée → vide.
  // Compare la date demandée (minuit UTC du jour ISO) à minuit-UTC du jour Paris,
  // sinon le serveur (souvent UTC) considère "aujourd'hui" un jour trop tôt.
  const today = startOfTodayParisAsUtc();
  if (date < today) {
    return { reason: "PAST_DATE", slots: [] };
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay(); // 0=Dim, 1=Lun, ..., 6=Sam

  // Bornes UTC réelles du jour PARIS demandé (pas du jour UTC) : sert à ne
  // récupérer que les indispos qui chevauchent ce jour Paris.
  const parisDayStartUtc = parisWallClockToUtc(input.date, "00:00");
  const parisDayEndUtc = parisWallClockToUtc(nextIsoDate(input.date), "00:00");

  // Fetch en parallèle
  const [
    bookableMonth,
    businessHoursRecurring,
    dayException,
    unavailabilities,
    recurringUnavail,
    bookings,
    settings,
  ] = await Promise.all([
    prisma.bookableMonth.findUnique({
      where: { year_month: { year, month } },
      select: { id: true },
    }),
    prisma.businessHours.findUnique({
      where: { dayOfWeek },
    }),
    // Exception pour ce jour précis (override les BusinessHours récurrents)
    prisma.dayException.findUnique({
      where: { date },
      select: {
        isOpen: true,
        openingTime: true,
        closingTime: true,
        breakStart: true,
        breakEnd: true,
      },
    }),
    prisma.unavailability.findMany({
      where: {
        startsAt: { lt: parisDayEndUtc },
        endsAt: { gt: parisDayStartUtc },
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.recurringUnavailability.findMany({
      where: {
        dayOfWeek,
        startsFrom: { lte: date },
        OR: [{ endsAt: null }, { endsAt: { gte: date } }],
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.booking.findMany({
      where: {
        date,
        status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
        ...(input.excludeBookingId
          ? { id: { not: input.excludeBookingId } }
          : {}),
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.platformSettings.findFirst({
      select: {
        bookingGranularityMinutes: true,
        bookingMinAdvanceHours: true,
      },
    }),
  ]);

  // Hiérarchie : DayException (date précise) override BusinessHours (récurrent).
  // Si une exception existe pour ce jour, elle dicte tout (ouverture/horaires/pause).
  const businessHours = dayException
    ? {
        dayOfWeek,
        isOpen: dayException.isOpen,
        openingTime: dayException.openingTime,
        closingTime: dayException.closingTime,
        breakStart: dayException.breakStart,
        breakEnd: dayException.breakEnd,
      }
    : businessHoursRecurring;

  // 1. Mois pas ouvert
  if (!bookableMonth) {
    return { reason: "MONTH_NOT_OPEN", slots: [] };
  }

  // 2. Jour fermé / pas d'horaires
  if (!businessHours) {
    return { reason: "NO_BUSINESS_HOURS_CONFIG", slots: [] };
  }
  if (
    !businessHours.isOpen ||
    !businessHours.openingTime ||
    !businessHours.closingTime
  ) {
    return { reason: "DAY_CLOSED", slots: [] };
  }

  const opening = toMinutes(businessHours.openingTime);
  const closing = toMinutes(businessHours.closingTime);
  const breakStart = businessHours.breakStart
    ? toMinutes(businessHours.breakStart)
    : null;
  const breakEnd = businessHours.breakEnd
    ? toMinutes(businessHours.breakEnd)
    : null;
  const granularity = settings?.bookingGranularityMinutes ?? 30;

  // Préparer les indispos en minutes pour comparaison rapide
  const blockedRanges: Array<[number, number]> = [];

  // Pause déjeuner
  if (breakStart !== null && breakEnd !== null) {
    blockedRanges.push([breakStart, breakEnd]);
  }

  // Unavailability ponctuelles : convertir l'instant absolu en minutes-mur
  // Paris et ne garder que la partie qui tombe dans CE jour Paris.
  for (const u of unavailabilities) {
    const range = unavailabilityToParisRange(u.startsAt, u.endsAt, input.date);
    if (range) blockedRanges.push(range);
  }

  // RecurringUnavailability : si startTime/endTime null → toute la journée
  for (const r of recurringUnavail) {
    if (!r.startTime || !r.endTime) {
      blockedRanges.push([0, 24 * 60]);
    } else {
      blockedRanges.push([toMinutes(r.startTime), toMinutes(r.endTime)]);
    }
  }

  // Bookings actives
  for (const b of bookings) {
    blockedRanges.push([toMinutes(b.startTime), toMinutes(b.endTime)]);
  }

  // 3. Générer les candidats : multiple de granularity entre opening et (closing - duration)
  const duration = input.totalDurationMinutes;
  const candidates: string[] = [];

  // Aligner le premier candidat sur la granularité depuis opening
  let firstCandidate = Math.ceil(opening / granularity) * granularity;
  const lastPossibleStart = closing - duration;

  // Si la date demandée est aujourd'hui (Paris), on remonte firstCandidate
  // au-dessus de (heure courante + buffer admin) pour exclure les créneaux
  // déjà passés ET ceux trop proches selon la politique salon.
  // Sans ça, à 18h50 la cliente verrait encore le créneau 09:00 du jour même.
  if (input.date === todayIsoParis()) {
    const leadHours = settings?.bookingMinAdvanceHours ?? 2;
    const nowMinutes = toMinutes(currentTimeHHMMParis());
    const earliestStart = nowMinutes + leadHours * 60;
    const minStart = Math.ceil(earliestStart / granularity) * granularity;
    if (minStart > firstCandidate) firstCandidate = minStart;
  }

  for (let start = firstCandidate; start <= lastPossibleStart; start += granularity) {
    const end = start + duration;

    // Skip si overlap avec un range bloqué
    const conflict = blockedRanges.some(([bStart, bEnd]) =>
      overlaps(start, end, bStart, bEnd),
    );
    if (conflict) continue;

    // Skip si le créneau dépasse le break (uniquement si on a un break)
    // → déjà couvert par blockedRanges, mais sécurité
    candidates.push(toHHMM(start));
  }

  return { slots: candidates };
}

