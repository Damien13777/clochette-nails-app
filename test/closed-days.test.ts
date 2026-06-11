/**
 * Tests closed-days — logique pure des jours structurellement fermés.
 *
 * Miroir des règles de computeAvailableSlots (availability.ts) : un jour est
 * fermé si pas de ligne BusinessHours, isOpen=false ou horaires manquants ;
 * une DayException pour la date override le pattern hebdo dans les deux sens.
 * Aucune DB requise : fonctions pures uniquement.
 */

import { describe, expect, it } from "vitest";
import {
  computeClosedWeekdays,
  isDayClosed,
  scheduleIsClosed,
  type ClosedDayData,
} from "@/lib/closed-days";

const OPEN = { isOpen: true, openingTime: "09:00", closingTime: "19:00" };
const CLOSED = { isOpen: false, openingTime: null, closingTime: null };

// Config seed Clochette : Lun(1)/Mer(3)/Dim(0) fermés, Mar/Jeu/Ven/Sam ouverts
const SEED_HOURS = [
  { dayOfWeek: 0, ...CLOSED },
  { dayOfWeek: 1, ...CLOSED },
  { dayOfWeek: 2, ...OPEN },
  { dayOfWeek: 3, ...CLOSED },
  { dayOfWeek: 4, ...OPEN },
  { dayOfWeek: 5, ...OPEN },
  { dayOfWeek: 6, ...OPEN },
];

describe("scheduleIsClosed", () => {
  it("ligne absente → fermé", () => {
    expect(scheduleIsClosed(null)).toBe(true);
    expect(scheduleIsClosed(undefined)).toBe(true);
  });

  it("isOpen=false → fermé", () => {
    expect(scheduleIsClosed(CLOSED)).toBe(true);
  });

  it("isOpen=true mais horaires manquants → fermé (miroir DAY_CLOSED)", () => {
    expect(
      scheduleIsClosed({ isOpen: true, openingTime: null, closingTime: null }),
    ).toBe(true);
    expect(
      scheduleIsClosed({ isOpen: true, openingTime: "09:00", closingTime: null }),
    ).toBe(true);
  });

  it("isOpen=true avec horaires complets → ouvert", () => {
    expect(scheduleIsClosed(OPEN)).toBe(false);
  });
});

describe("computeClosedWeekdays", () => {
  it("config seed : Dim/Lun/Mer fermés", () => {
    expect(computeClosedWeekdays(SEED_HOURS)).toEqual([0, 1, 3]);
  });

  it("aucune ligne BusinessHours → les 7 jours fermés", () => {
    expect(computeClosedWeekdays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("ligne manquante pour un jour → ce jour fermé", () => {
    const partial = SEED_HOURS.filter((h) => h.dayOfWeek !== 6);
    expect(computeClosedWeekdays(partial)).toEqual([0, 1, 3, 6]);
  });
});

describe("isDayClosed", () => {
  const data: ClosedDayData = {
    closedWeekdays: [0, 1, 3],
    exceptions: [
      { date: "2026-06-16", closed: true }, // mardi exceptionnellement fermé
      { date: "2026-06-15", closed: false }, // lundi exceptionnellement ouvert
    ],
  };

  it("weekday fermé sans exception → fermé (lundi 22/06)", () => {
    expect(isDayClosed("2026-06-22", 1, data)).toBe(true);
  });

  it("weekday ouvert sans exception → ouvert (jeudi 18/06)", () => {
    expect(isDayClosed("2026-06-18", 4, data)).toBe(false);
  });

  it("exception fermeture sur weekday ouvert → fermé (mardi 16/06)", () => {
    expect(isDayClosed("2026-06-16", 2, data)).toBe(true);
  });

  it("exception ouverture sur weekday fermé → ouvert (lundi 15/06)", () => {
    expect(isDayClosed("2026-06-15", 1, data)).toBe(false);
  });
});
