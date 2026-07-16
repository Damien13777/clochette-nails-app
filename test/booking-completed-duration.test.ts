import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";

vi.mock("@/lib/auth-guards", () => ({ requireAdmin: vi.fn(), requireAdminUserId: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "test" }) }));
vi.mock("@/lib/invoice/create-invoice", () => ({
  createInvoiceForBooking: vi.fn().mockResolvedValue({ id: "inv1", number: "FAC-TEST" }),
  InvoiceError: class extends Error {},
}));
vi.mock("@/lib/invoice/invoice-email", () => ({ sendInvoiceEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/outbound-events", () => ({ emitOutboundEvent: vi.fn() }));

import { requireAdmin } from "@/lib/auth-guards";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { markBookingCompleted } from "@/lib/actions/booking-admin";

async function makeAdmin() {
  const rand = randomUUID().slice(0, 8);
  const admin = await db.user.create({ data: { email: `admin-${rand}@test.local`, role: "ADMIN" } });
  vi.mocked(requireAdmin).mockResolvedValue({ id: admin.id, email: admin.email });
  return admin;
}

async function makeConfirmedBooking(totalDurationMinutes: number) {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Pose gel",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: totalDurationMinutes,
      priceCents: 6500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
  return db.booking.create({
    data: {
      date: new Date("2026-09-01"),
      startTime: "10:00",
      endTime: "11:30",
      serviceId: service.id,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: "jean@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes,
      totalPriceCents: 6500,
      depositCents: 1950,
      status: "CONFIRMED",
    },
  });
}

function completedPayload(bookingId: string): Record<string, unknown> | undefined {
  const call = vi
    .mocked(emitOutboundEvent)
    .mock.calls.find(([t, p]) => t === "booking.completed" && (p as Record<string, unknown>).bookingId === bookingId);
  return call?.[1] as Record<string, unknown> | undefined;
}

beforeEach(async () => {
  await truncateAll();
  vi.mocked(emitOutboundEvent).mockClear();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("markBookingCompleted — durée réelle", () => {
  it("stocke la durée réelle saisie et émet réel + prévu", async () => {
    await makeAdmin();
    const booking = await makeConfirmedBooking(90);

    const res = await markBookingCompleted(booking.id, {
      revenueCents: 6500,
      completionPaymentMethod: "cash",
      realDurationMinutes: 75,
    });
    expect(res.ok).toBe(true);

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.realDurationMinutes).toBe(75);

    const payload = await completedPayload(booking.id);
    expect(payload).toMatchObject({ realDurationMinutes: 75, plannedDurationMinutes: 90 });
  });

  it("durée absente → fallback sur la durée prévue", async () => {
    await makeAdmin();
    const booking = await makeConfirmedBooking(90);

    await markBookingCompleted(booking.id, { revenueCents: 6500, completionPaymentMethod: "cash" });

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.realDurationMinutes).toBe(90);
    expect(await completedPayload(booking.id)).toMatchObject({ realDurationMinutes: 90, plannedDurationMinutes: 90 });
  });

  it("durée invalide (hors bornes) → fallback sur la durée prévue", async () => {
    await makeAdmin();
    const booking = await makeConfirmedBooking(60);

    await markBookingCompleted(booking.id, { revenueCents: 6500, completionPaymentMethod: "cash", realDurationMinutes: 5000 });

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.realDurationMinutes).toBe(60);
  });
});
