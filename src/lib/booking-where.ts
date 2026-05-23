/**
 * Clauses Prisma `where` partagées pour les filtres temporels Booking.
 *
 * Centralisé pour éviter la drift entre le dashboard /admin et la liste
 * /admin/bookings : avant, "upcoming" filtrait sur `date >= today` sans
 * exclure les RDV du jour déjà terminés (endTime < maintenant). Un RDV
 * de 9h restait listé à 11h dans "Prochains rendez-vous" tout en étant
 * aussi présent dans "RDV passés à confirmer comme honorés".
 *
 * Le miroir `upcoming` / `past` est exhaustif : chaque RDV est soit
 * l'un, soit l'autre, jamais les deux.
 */

import type { Prisma } from "@prisma/client";
import { currentTimeHHMMParis, startOfTodayParisAsUtc } from "./paris-day";

/**
 * RDV "à venir" : pas encore terminés.
 *  - Jours futurs : tous
 *  - Aujourd'hui : ceux dont `endTime >= maintenant Paris`
 *
 * À combiner avec un filtre de status (CONFIRMED, AWAITING_DEPOSIT…).
 */
export function upcomingBookingsWhere(): Prisma.BookingWhereInput {
  const today = startOfTodayParisAsUtc();
  const now = currentTimeHHMMParis();
  return {
    OR: [
      { date: { gt: today } },
      { AND: [{ date: today }, { endTime: { gte: now } }] },
    ],
  };
}

/**
 * RDV "passés" : déjà terminés.
 *  - Jours antérieurs : tous
 *  - Aujourd'hui : ceux dont `endTime < maintenant Paris`
 *
 * À combiner avec un filtre de status (souvent CONFIRMED pour la liste
 * "à marquer honoré").
 */
export function pastBookingsWhere(): Prisma.BookingWhereInput {
  const today = startOfTodayParisAsUtc();
  const now = currentTimeHHMMParis();
  return {
    OR: [
      { date: { lt: today } },
      { AND: [{ date: today }, { endTime: { lt: now } }] },
    ],
  };
}
