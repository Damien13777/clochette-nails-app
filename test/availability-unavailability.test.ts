/**
 * Régression : les indispos admin (instants absolus) doivent bloquer les
 * créneaux à la BONNE heure-mur Paris.
 *
 * Bug historique : computeAvailableSlots clampait les instants en minutes
 * depuis minuit UTC, puis comparait à des horaires-mur Paris. L'été (UTC+2),
 * une indispo 08:00→10:00 (stockée 06:00Z→08:00Z) était calculée comme
 * 06:00→08:00 → avant l'ouverture → aucun blocage → les clientes réservaient
 * par-dessus. Ces tests vérrouillent la conversion Paris.
 *
 * Fonctions pures uniquement — aucune DB.
 */

import { describe, expect, it } from "vitest";
import {
  parisMinutesSinceMidnight,
  parisWallClockToUtc,
  unavailabilityToParisRange,
} from "@/lib/paris-day";

describe("parisWallClockToUtc (DST-aware)", () => {
  it("été (UTC+2) : 08:00 Paris → 06:00Z", () => {
    expect(parisWallClockToUtc("2026-07-09", "08:00").toISOString()).toBe(
      "2026-07-09T06:00:00.000Z",
    );
  });

  it("hiver (UTC+1) : 08:00 Paris → 07:00Z", () => {
    expect(parisWallClockToUtc("2026-01-15", "08:00").toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
  });

  it("minuit Paris été → 22:00Z la veille", () => {
    expect(parisWallClockToUtc("2026-07-09", "00:00").toISOString()).toBe(
      "2026-07-08T22:00:00.000Z",
    );
  });
});

describe("parisMinutesSinceMidnight", () => {
  it("été : 06:00Z → 480 (08:00 Paris)", () => {
    expect(parisMinutesSinceMidnight(new Date("2026-07-09T06:00:00Z"))).toBe(480);
  });

  it("hiver : 07:00Z → 480 (08:00 Paris)", () => {
    expect(parisMinutesSinceMidnight(new Date("2026-01-15T07:00:00Z"))).toBe(480);
  });
});

describe("unavailabilityToParisRange — le fix du bug", () => {
  it("indispo 08:00→10:00 Paris (stockée été) bloque bien 480→600, PAS 360→480", () => {
    // Ce que la modale admin stocke quand l'admin (navigateur Paris) saisit
    // 08:00→10:00 le 09/07 : instants 06:00Z→08:00Z.
    const startsAt = new Date("2026-07-09T06:00:00Z");
    const endsAt = new Date("2026-07-09T08:00:00Z");
    expect(unavailabilityToParisRange(startsAt, endsAt, "2026-07-09")).toEqual([
      480, 600,
    ]);
  });

  it("scénario prod C : 17:00→17:45 Paris → 1020→1065", () => {
    const startsAt = parisWallClockToUtc("2026-07-09", "17:00");
    const endsAt = parisWallClockToUtc("2026-07-09", "17:45");
    expect(unavailabilityToParisRange(startsAt, endsAt, "2026-07-09")).toEqual([
      1020, 1065,
    ]);
  });

  it("scénario prod A : 16:30→17:30 Paris → 990→1050", () => {
    const startsAt = parisWallClockToUtc("2026-07-06", "16:30");
    const endsAt = parisWallClockToUtc("2026-07-06", "17:30");
    expect(unavailabilityToParisRange(startsAt, endsAt, "2026-07-06")).toEqual([
      990, 1050,
    ]);
  });

  it("indispo hors du jour Paris → null", () => {
    const startsAt = parisWallClockToUtc("2026-07-10", "08:00");
    const endsAt = parisWallClockToUtc("2026-07-10", "10:00");
    expect(unavailabilityToParisRange(startsAt, endsAt, "2026-07-09")).toBeNull();
  });

  it("indispo multi-jours → clampée aux bornes du jour Paris (0→1440)", () => {
    // Vacances du 08/07 au 12/07 : le 09/07 est intégralement bloqué.
    const startsAt = parisWallClockToUtc("2026-07-08", "00:00");
    const endsAt = parisWallClockToUtc("2026-07-12", "00:00");
    expect(unavailabilityToParisRange(startsAt, endsAt, "2026-07-09")).toEqual([
      0, 1440,
    ]);
  });

  it("hiver : indispo 08:00→10:00 Paris (stockée 07:00Z→09:00Z) → 480→600", () => {
    const startsAt = new Date("2026-01-15T07:00:00Z");
    const endsAt = new Date("2026-01-15T09:00:00Z");
    expect(unavailabilityToParisRange(startsAt, endsAt, "2026-01-15")).toEqual([
      480, 600,
    ]);
  });
});
