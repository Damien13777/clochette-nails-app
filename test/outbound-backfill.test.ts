import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import { backfillOutbound } from "@/lib/outbound/backfill";

async function makeCompletedBooking(createdAt: Date) {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Prestation",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
  return db.booking.create({
    data: {
      date: new Date("2026-06-01"),
      startTime: "10:00",
      endTime: "10:30",
      serviceId: service.id,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: "jean@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 30,
      totalPriceCents: 2500,
      depositCents: 750,
      status: "COMPLETED",
      revenueCents: 2500,
      completionPaymentMethod: "cash",
      createdAt,
    },
  });
}

const BEFORE = new Date("2026-07-01T00:00:00Z");

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("MANAGEMENT_API_URL", "http://erp.test");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("backfillOutbound", () => {
  it("reconstruit booking.completed (eventId déterministe) et est idempotent", async () => {
    const b = await makeCompletedBooking(new Date("2026-06-01T10:00:00Z"));

    const r1 = await backfillOutbound({ db, before: BEFORE });
    expect(r1).toMatchObject({ seeded: 1, skipped: 0 });

    const rows = await db.outboundEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe(`backfill:booking.completed:${b.id}`);
    expect(rows[0].type).toBe("booking.completed");
    expect((rows[0].payload as { revenueCents: number }).revenueCents).toBe(2500);

    // re-run → dedup, aucune nouvelle row
    const r2 = await backfillOutbound({ db, before: BEFORE });
    expect(r2).toMatchObject({ seeded: 0, skipped: 1 });
    expect(await db.outboundEvent.count()).toBe(1);
  });

  it("respecte le cutover (ignore les faits postérieurs à `before`)", async () => {
    await makeCompletedBooking(new Date("2026-07-05T10:00:00Z"));
    const r = await backfillOutbound({ db, before: BEFORE });
    expect(r.seeded).toBe(0);
  });

  it("no-op sans MANAGEMENT_API_URL", async () => {
    vi.stubEnv("MANAGEMENT_API_URL", "");
    await makeCompletedBooking(new Date("2026-06-01T10:00:00Z"));
    const r = await backfillOutbound({ db, before: BEFORE });
    expect(r.seeded).toBe(0);
    expect(await db.outboundEvent.count()).toBe(0);
  });
});
