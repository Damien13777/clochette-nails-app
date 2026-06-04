import { describe, expect, it } from "vitest";
import {
  startOfDayParisAsUtc,
  isoDateParis,
  mondayIsoForTodayParis,
} from "@/lib/paris-day";

describe("paris-day — correction DST (le bug que ces helpers évitent)", () => {
  it("été (UTC+2) : 22:30Z est déjà le lendemain à Paris", () => {
    // 2025-07-15T22:30Z = 2025-07-16 00:30 à Paris → le jour Paris est le 16.
    const d = new Date("2025-07-15T22:30:00.000Z");
    expect(startOfDayParisAsUtc(d).toISOString()).toBe("2025-07-16T00:00:00.000Z");
    expect(isoDateParis(d)).toBe("2025-07-16");
  });

  it("hiver (UTC+1) : 23:30Z est déjà le lendemain à Paris", () => {
    // 2025-01-15T23:30Z = 2025-01-16 00:30 à Paris → le jour Paris est le 16.
    const d = new Date("2025-01-15T23:30:00.000Z");
    expect(startOfDayParisAsUtc(d).toISOString()).toBe("2025-01-16T00:00:00.000Z");
    expect(isoDateParis(d)).toBe("2025-01-16");
  });

  it("même instant UTC, même jour Paris en milieu de journée", () => {
    const d = new Date("2025-07-15T10:00:00.000Z"); // 12:00 Paris
    expect(isoDateParis(d)).toBe("2025-07-15");
  });
});

describe("paris-day — mondayIsoForTodayParis", () => {
  it("renvoie toujours un lundi (UTC day === 1)", () => {
    const iso = mondayIsoForTodayParis();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = iso.split("-").map(Number);
    expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1);
  });
});
