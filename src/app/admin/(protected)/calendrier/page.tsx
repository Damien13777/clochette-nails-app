/**
 * Page /admin/calendrier — vue semaine.
 *
 * Session 1 : lecture seule des bookings + édition horaires/indispos.
 * Session 2 ajoutera : vue mois, RecurringUnavailability, BookableMonth toggle.
 *
 * SearchParams :
 *  - week=YYYY-MM-DD : lundi de la semaine affichée (défaut = lundi de la semaine courante)
 *  - g=15|30|60 : granularité d'affichage en minutes (défaut = bookingGranularityMinutes
 *    de PlatformSettings, ou 30)
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mondayIsoForTodayParis, startOfTodayParisAsUtc } from "@/lib/paris-day";
import {
  addDaysIso,
  getMondayIso,
  isoToUtcDate,
  weekDaysIso,
} from "@/lib/calendar";
import { CalendarHeader } from "./calendar-header";
import { MobileDayView } from "./mobile-day-view";
import { MobileWeekSelector } from "./mobile-week-selector";
import { MonthView } from "./month-view";
import { WeekGrid } from "./week-grid";

export const metadata: Metadata = {
  title: "Calendrier · Admin",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  week?: string;
  g?: string;
  day?: string; // YYYY-MM-DD pour vue mobile single-day
  view?: "week" | "month";
};

const ALLOWED_GRANULARITIES = [15, 30, 60];

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const view: "week" | "month" = params.view === "month" ? "month" : "week";

  // Résolution semaine d'ancrage
  const weekStartIso =
    params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week)
      ? getMondayIso(isoToUtcDate(params.week))
      : mondayIsoForTodayParis();
  const weekEndIso = addDaysIso(weekStartIso, 6);
  const weekStartDate = isoToUtcDate(weekStartIso);
  // Pour les bookings on filtre date inclus → +1 jour fin
  const dayAfterWeekEnd = isoToUtcDate(addDaysIso(weekEndIso, 1));

  // En mode mois : on fetch tout le mois contenant la semaine d'ancrage
  // (du 1er au dernier jour du mois). La grille de la vue mois inclut
  // aussi les bordures du mois précédent/suivant — on fetch large pour
  // que ces "bordures" aient leurs vrais dots.
  // weekStartIso peut être un lundi de fin du mois précédent (bordure de
  // grille) → on prend +7 jours pour avoir une date sûre dans le mois affiché.
  const anchorDate = isoToUtcDate(weekStartIso);
  anchorDate.setUTCDate(anchorDate.getUTCDate() + 7);
  const monthYear = anchorDate.getUTCFullYear();
  const monthIndex = anchorDate.getUTCMonth();
  const monthFirstDayDate = new Date(Date.UTC(monthYear, monthIndex, 1));
  const monthFirstMondayIso = getMondayIso(monthFirstDayDate);
  // Grille mensuelle = 6 semaines max → on fetch sur 42 jours pour couvrir
  const monthGridStartIso = monthFirstMondayIso;
  const monthGridEndIso = addDaysIso(monthGridStartIso, 41);
  const monthGridStartDate = isoToUtcDate(monthGridStartIso);
  const monthGridDayAfterEnd = isoToUtcDate(addDaysIso(monthGridEndIso, 1));

  // Plage de fetch : couvre soit la semaine, soit toute la grille mensuelle
  const fetchStartDate = view === "month" ? monthGridStartDate : weekStartDate;
  const fetchDayAfterEnd =
    view === "month" ? monthGridDayAfterEnd : dayAfterWeekEnd;

  // Fetch tout en parallèle
  const [
    settings,
    businessHours,
    bookings,
    unavailabilities,
    services,
    dayExceptions,
  ] = await Promise.all([
    prisma.platformSettings.findFirstOrThrow({
      select: { bookingGranularityMinutes: true },
    }),
    prisma.businessHours.findMany({
      orderBy: { dayOfWeek: "asc" },
      select: {
        dayOfWeek: true,
        isOpen: true,
        openingTime: true,
        closingTime: true,
        breakStart: true,
        breakEnd: true,
      },
    }),
    prisma.booking.findMany({
      where: {
        date: { gte: fetchStartDate, lt: fetchDayAfterEnd },
        status: { in: ["AWAITING_DEPOSIT", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        clientFirstName: true,
        clientLastName: true,
        adminNotes: true,
        service: { select: { title: true, category: true } },
        _count: { select: { files: true } },
      },
    }),
    prisma.unavailability.findMany({
      where: {
        startsAt: { lt: fetchDayAfterEnd },
        endsAt: { gt: fetchStartDate },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    }),
    // Services pour le form RDV admin
    prisma.service.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        durationMinutes: true,
        priceCents: true,
      },
    }),
    // Exceptions d'horaires pour la semaine affichée
    prisma.dayException.findMany({
      where: {
        date: { gte: fetchStartDate, lt: fetchDayAfterEnd },
      },
      select: {
        date: true,
        isOpen: true,
        openingTime: true,
        closingTime: true,
        breakStart: true,
        breakEnd: true,
        reason: true,
      },
    }),
  ]);

  // ─── Fetch pour le panneau latéral "Gérer" ─────────────
  // (séquentiel après le Promise.all pour simplifier — pas critique en perf
  // car le panneau s'ouvre à la demande)
  // Minuit du jour Paris (côté UTC) — déterministe quelle que soit la TZ
  // du serveur. Utilisé pour filtrer les indispos ponctuelles et récurrentes.
  const todayMidnight = startOfTodayParisAsUtc();
  const threeMonthsAgo = new Date(todayMidnight);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const twelveMonthsLater = new Date(todayMidnight);
  twelveMonthsLater.setMonth(twelveMonthsLater.getMonth() + 12);

  const [bookableMonths, recurringUnavails, upcomingUnavails] = await Promise.all([
    prisma.bookableMonth.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { year: true, month: true },
    }),
    prisma.recurringUnavailability.findMany({
      where: {
        OR: [{ endsAt: null }, { endsAt: { gte: todayMidnight } }],
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        startsFrom: true,
        endsAt: true,
        reason: true,
      },
    }),
    prisma.unavailability.findMany({
      where: { endsAt: { gte: todayMidnight } },
      orderBy: { startsAt: "asc" },
      take: 50,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    }),
  ]);

  // Bookable months affichables (3 mois passés + 12 mois futurs) — liste complète
  // que le panneau peut toggler. Format YYYY-MM pour key/lookup.
  const monthsToDisplay: { year: number; month: number; isOpen: boolean }[] = [];
  const openSet = new Set(bookableMonths.map((m) => `${m.year}-${m.month}`));
  const cursor = new Date(threeMonthsAgo);
  while (cursor <= twelveMonthsLater) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    monthsToDisplay.push({
      year: y,
      month: m,
      isOpen: openSet.has(`${y}-${m}`),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Options applicables : liées par applicableCategories[], pas par relation.
  // On fetch toutes les options publiées + on filtre côté client par catégorie.
  const allOptions = await prisma.serviceOption.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      addedDurationMinutes: true,
      addedPriceCents: true,
      applicableCategories: true,
    },
  });

  // Granularité : URL > Paramètres > 30 par défaut
  const granularityParam = params.g ? parseInt(params.g, 10) : NaN;
  const granularity = ALLOWED_GRANULARITIES.includes(granularityParam)
    ? granularityParam
    : settings.bookingGranularityMinutes;

  // Plage horaire : journée complète 00h00 → 23h59. La grille scrolle
  // verticalement, positionnée par défaut sur 07h00 (cf. WeekGrid / MobileDayView).
  const startHour = 0;
  const endHour = 24;

  // Sérialisation partagée mobile + desktop
  const serializedBookings = bookings.map((b) => ({
    id: b.id,
    dateIso: b.date.toISOString().slice(0, 10),
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    clientName: `${b.clientFirstName} ${b.clientLastName.charAt(0)}.`.trim(),
    serviceTitle: b.service.title,
    serviceCategory: b.service.category,
    adminNotes: b.adminNotes,
    filesCount: b._count.files,
  }));
  const serializedUnavails = unavailabilities.map((u) => ({
    id: u.id,
    startsAt: u.startsAt.toISOString(),
    endsAt: u.endsAt.toISOString(),
    reason: u.reason,
  }));
  // Index par dateIso pour lookup rapide dans les composants
  const serializedExceptions = dayExceptions.map((e) => ({
    dateIso: e.date.toISOString().slice(0, 10),
    isOpen: e.isOpen,
    openingTime: e.openingTime,
    closingTime: e.closingTime,
    breakStart: e.breakStart,
    breakEnd: e.breakEnd,
    reason: e.reason,
  }));
  // Indispos récurrentes pour affichage en bandes bleues sur la grille admin
  const serializedRecurring = recurringUnavails.map((u) => ({
    id: u.id,
    dayOfWeek: u.dayOfWeek,
    startTime: u.startTime,
    endTime: u.endTime,
    startsFromIso: u.startsFrom.toISOString().slice(0, 10),
    endsAtIso: u.endsAt ? u.endsAt.toISOString().slice(0, 10) : null,
    reason: u.reason,
  }));

  // ─── Mobile : jour sélectionné + data par jour pour la bande ────────
  // todayIso = YYYY-MM-DD du jour Paris (pas du jour UTC) pour matcher
  // les comparaisons avec les dayIso construits depuis Booking.date.
  const todayIso = startOfTodayParisAsUtc().toISOString().slice(0, 10);
  const weekDays = weekDaysIso(weekStartIso);

  const requestedDay = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)
    ? params.day
    : null;
  // Le jour sélectionné doit être dans la semaine affichée
  const selectedDayIso = requestedDay && weekDays.includes(requestedDay)
    ? requestedDay
    : weekDays.includes(todayIso)
      ? todayIso
      : weekStartIso; // sinon lundi

  // Data par jour pour la bande mobile (count bookings + flags)
  const daysData = weekDays.map((dayIso) => {
    const date = new Date(dayIso + "T00:00:00Z");
    const dow = date.getUTCDay();
    const bh = businessHours.find((b) => b.dayOfWeek === dow);
    return {
      iso: dayIso,
      bookingsCount: serializedBookings.filter((b) => b.dateIso === dayIso).length,
      isClosed: !bh || !bh.isOpen || !bh.openingTime,
      hasUnavail: serializedUnavails.some((u) => {
        const dayStart = new Date(dayIso + "T00:00:00");
        const dayEnd = new Date(dayIso + "T23:59:59");
        return new Date(u.endsAt) > dayStart && new Date(u.startsAt) < dayEnd;
      }),
    };
  });

  return (
    <div className="max-w-[1600px] px-4 lg:px-6 py-8">
      <CalendarHeader
        weekStartIso={weekStartIso}
        granularity={granularity}
        view={view}
        selectedDayIso={selectedDayIso}
        bookableMonths={monthsToDisplay}
        recurringUnavails={recurringUnavails.map((u) => ({
          id: u.id,
          dayOfWeek: u.dayOfWeek,
          startTime: u.startTime,
          endTime: u.endTime,
          startsFrom: u.startsFrom.toISOString(),
          endsAt: u.endsAt ? u.endsAt.toISOString() : null,
          reason: u.reason,
        }))}
        upcomingUnavails={upcomingUnavails.map((u) => ({
          id: u.id,
          startsAt: u.startsAt.toISOString(),
          endsAt: u.endsAt.toISOString(),
          reason: u.reason,
        }))}
      />

      {view === "month" ? (
        <MonthView
          weekStartIso={weekStartIso}
          todayIso={todayIso}
          bookings={serializedBookings.map((b) => ({
            id: b.id,
            dateIso: b.dateIso,
            status: b.status,
            serviceCategory: b.serviceCategory,
          }))}
          unavailabilities={serializedUnavails}
          dayExceptions={serializedExceptions}
          recurringUnavails={serializedRecurring}
          businessHours={businessHours.map((b) => ({
            dayOfWeek: b.dayOfWeek,
            isOpen: b.isOpen,
          }))}
          bookableMonthsSet={
            new Set(monthsToDisplay.filter((m) => m.isOpen).map((m) => `${m.year}-${m.month}`))
          }
        />
      ) : (
        <>
      {/* Vue mobile (< md) */}
      <div className="md:hidden">
        <MobileWeekSelector
          weekStartIso={weekStartIso}
          selectedDayIso={selectedDayIso}
          daysData={daysData}
          todayIso={todayIso}
        />
        <MobileDayView
          selectedDayIso={selectedDayIso}
          granularity={granularity}
          startHour={startHour}
          endHour={endHour}
          businessHours={businessHours}
          bookings={serializedBookings}
          unavailabilities={serializedUnavails}
          dayExceptions={serializedExceptions}
          recurringUnavails={serializedRecurring}
          todayIso={todayIso}
          services={services}
          options={allOptions}
        />
      </div>

      {/* Vue desktop (md+) — semaine */}
      <div className="hidden md:block">
        <WeekGrid
          weekStartIso={weekStartIso}
          granularity={granularity}
          startHour={startHour}
          endHour={endHour}
          businessHours={businessHours}
          bookings={serializedBookings}
          unavailabilities={serializedUnavails}
          dayExceptions={serializedExceptions}
          recurringUnavails={serializedRecurring}
          todayIso={todayIso}
          services={services}
          options={allOptions}
        />
      </div>
        </>
      )}
    </div>
  );
}
