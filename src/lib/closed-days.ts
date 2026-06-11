/**
 * Jours structurellement fermés — logique pure, partagée serveur/client.
 *
 * Permet au calendrier de réservation de griser les jours fermés sans
 * précalculer la disponibilité fine par créneau. Un jour est « fermé » si :
 *  - une DayException existe pour la date → elle dicte tout (un jour
 *    exceptionnellement ouvert sur un weekday fermé redevient cliquable) ;
 *  - sinon, le pattern hebdo BusinessHours : pas de ligne, isOpen=false ou
 *    horaires manquants → fermé (miroir exact de computeAvailableSlots).
 *
 * Ce module est volontairement sans import serveur (pas de Prisma) : il est
 * consommé par le Client Component BookingCalendar. Les fetchs Prisma restent
 * dans la page serveur /reservation.
 */

export type DayScheduleRow = {
  isOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
};

export type ClosedDayData = {
  /** dayOfWeek JS (0=Dim … 6=Sam) structurellement fermés */
  closedWeekdays: number[];
  /** Exceptions par date "YYYY-MM-DD" : true = fermé, false = ouvert (override) */
  exceptions: Array<{ date: string; closed: boolean }>;
};

export function scheduleIsClosed(row: DayScheduleRow | null | undefined): boolean {
  return !row || !row.isOpen || !row.openingTime || !row.closingTime;
}

export function computeClosedWeekdays(
  rows: Array<DayScheduleRow & { dayOfWeek: number }>,
): number[] {
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
  const closed: number[] = [];
  for (let day = 0; day <= 6; day++) {
    if (scheduleIsClosed(byDay.get(day))) closed.push(day);
  }
  return closed;
}

export function isDayClosed(
  dateKey: string,
  dayOfWeek: number,
  data: ClosedDayData,
): boolean {
  const exception = data.exceptions.find((e) => e.date === dateKey);
  if (exception) return exception.closed;
  return data.closedWeekdays.includes(dayOfWeek);
}
