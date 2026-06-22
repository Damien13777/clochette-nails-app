import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import { recordReminderEmailEvent } from "@/lib/reminder-email-events";

async function makeService() {
  const rand = randomUUID().slice(0, 8);
  return db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "S",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
}

async function makeBooking(extra: Record<string, unknown>) {
  const service = await makeService();
  return db.booking.create({
    data: {
      date: new Date("2026-09-01"),
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
      status: "CONFIRMED",
      ...extra,
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("recordReminderEmailEvent", () => {
  it("pose reminderJ7OpenedAt à la 1re ouverture (J-7)", async () => {
    const b = await makeBooking({ reminderJ7MessageId: "msg-j7-1" });
    const at = new Date("2026-08-25T08:00:00Z");
    const matched = await recordReminderEmailEvent("msg-j7-1", "opened", at);
    expect(matched).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(updated.reminderJ7OpenedAt?.toISOString()).toBe(at.toISOString());
  });

  it("garde la 1re ouverture (2e open n'écrase pas)", async () => {
    const b = await makeBooking({ reminderJ7MessageId: "msg-j7-2" });
    const first = new Date("2026-08-25T08:00:00Z");
    const second = new Date("2026-08-25T09:00:00Z");
    await recordReminderEmailEvent("msg-j7-2", "opened", first);
    await recordReminderEmailEvent("msg-j7-2", "opened", second);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(updated.reminderJ7OpenedAt?.toISOString()).toBe(first.toISOString());
  });

  it("pose reminderJ7BouncedAt sur un bounce", async () => {
    const b = await makeBooking({ reminderJ7MessageId: "msg-j7-3" });
    const at = new Date("2026-08-25T08:05:00Z");
    const matched = await recordReminderEmailEvent("msg-j7-3", "bounced", at);
    expect(matched).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(updated.reminderJ7BouncedAt?.toISOString()).toBe(at.toISOString());
  });

  it("cible le J-1 via reminderJ1MessageId", async () => {
    const b = await makeBooking({ reminderJ1MessageId: "msg-j1-1" });
    const at = new Date("2026-08-31T08:00:00Z");
    await recordReminderEmailEvent("msg-j1-1", "opened", at);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(updated.reminderJ1OpenedAt?.toISOString()).toBe(at.toISOString());
    expect(updated.reminderJ7OpenedAt).toBeNull();
  });

  it("messageId inconnu → false, rien touché", async () => {
    const matched = await recordReminderEmailEvent("inconnu", "opened", new Date());
    expect(matched).toBe(false);
  });
});
