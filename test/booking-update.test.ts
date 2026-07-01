import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";

// requireAdmin lit la session NextAuth → on la mocke. L'AuditLog a une FK
// Restrict vers User, donc l'admin renvoyé doit exister réellement en base
// (créé par makeAdmin + injecté dans le mock à chaque test).
vi.mock("@/lib/auth-guards", () => ({
  requireAdmin: vi.fn(),
  requireAdminUserId: vi.fn(),
}));
// revalidatePath n'a pas de store de génération statique hors requête Next.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// On isole l'envoi d'email : sendEmail no-op + builder espionné pour vérifier
// le montant d'acompte réellement transmis à la cliente (notifyClient).
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "test" }),
}));
vi.mock("@/lib/email/templates/booking-confirmation", () => ({
  buildBookingConfirmationEmail: vi.fn(() => ({
    subject: "s",
    html: "h",
    text: "t",
  })),
}));

import { requireAdmin } from "@/lib/auth-guards";
import { buildBookingConfirmationEmail } from "@/lib/email/templates/booking-confirmation";
import {
  updateBookingDetails,
  updateBookingRevenue,
} from "@/lib/actions/booking-admin";

async function makeAdmin() {
  const rand = randomUUID().slice(0, 8);
  const admin = await db.user.create({
    data: { email: `admin-${rand}@test.local`, role: "ADMIN" },
  });
  vi.mocked(requireAdmin).mockResolvedValue({ id: admin.id, email: admin.email });
  return admin;
}

async function makeService(durationMinutes: number, priceCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Prestation",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes,
      priceCents,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
}

async function makeOption(addedDurationMinutes: number, addedPriceCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.serviceOption.create({
    data: {
      slug: `opt-${rand}`,
      title: "Option",
      addedDurationMinutes,
      addedPriceCents,
      applicableCategories: ["SOIN_MAINS"],
      status: "PUBLISHED",
    },
  });
}

async function makeBooking(opts: {
  serviceId: string;
  startTime: string;
  endTime: string;
  status?: "AWAITING_DEPOSIT" | "CONFIRMED" | "COMPLETED";
  totalDurationMinutes?: number;
  totalPriceCents?: number;
  depositCents?: number;
  optionIds?: string[];
  paidAt?: Date | null;
  paymentMethod?: string | null;
  stripePaymentId?: string | null;
}) {
  return db.booking.create({
    data: {
      date: new Date("2026-09-01"),
      startTime: opts.startTime,
      endTime: opts.endTime,
      serviceId: opts.serviceId,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: "jean@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: opts.totalDurationMinutes ?? 30,
      totalPriceCents: opts.totalPriceCents ?? 2500,
      depositCents: opts.depositCents ?? 750,
      status: opts.status ?? "CONFIRMED",
      paidAt: opts.paidAt ?? null,
      paymentMethod: opts.paymentMethod ?? null,
      stripePaymentId: opts.stripePaymentId ?? null,
      options: opts.optionIds
        ? { create: opts.optionIds.map((id) => ({ serviceOptionId: id })) }
        : undefined,
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("updateBookingDetails", () => {
  it("met à jour les coordonnées sans changer la prestation", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jeanne",
        lastName: "Durand",
        email: "jeanne@test.local",
        phone: "0611223344",
        message: null,
      },
      serviceId: service.id,
      optionIds: [],
    });

    expect(res.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.clientFirstName).toBe("Jeanne");
    expect(updated.clientLastName).toBe("Durand");
    expect(updated.clientEmail).toBe("jeanne@test.local");
    expect(updated.totalDurationMinutes).toBe(30);
    expect(updated.endTime).toBe("10:30");
  });

  it("recalcule durée/prix/endTime au changement de prestation", async () => {
    await makeAdmin();
    const serviceA = await makeService(30, 2500);
    const serviceB = await makeService(60, 5000);
    const booking = await makeBooking({
      serviceId: serviceA.id,
      startTime: "10:00",
      endTime: "10:30",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: serviceB.id,
      optionIds: [],
    });

    expect(res.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.serviceId).toBe(serviceB.id);
    expect(updated.totalDurationMinutes).toBe(60);
    expect(updated.totalPriceCents).toBe(5000);
    expect(updated.endTime).toBe("11:00");
    // Pas de settings en base de test → fallback acompte 30 %.
    expect(updated.depositCents).toBe(1500);
  });

  it("fige l'acompte déjà encaissé (paidAt) même si la nouvelle prestation est moins chère", async () => {
    // Régression : une cliente paie 34,50 € d'acompte via Stripe, puis l'admin
    // corrige sa prestation pour une moins chère (acompte théorique 30 €). Le
    // montant réellement perçu ne doit JAMAIS être réécrit — sinon on fausse
    // l'affichage paiement, le remboursement proposé et le CA (finances).
    await makeAdmin();
    const paid = await makeService(230, 11500);
    const cheaper = await makeService(230, 10000);
    const booking = await makeBooking({
      serviceId: paid.id,
      startTime: "10:00",
      endTime: "13:50",
      totalDurationMinutes: 230,
      totalPriceCents: 11500,
      depositCents: 3450, // acompte réellement encaissé
      paidAt: new Date("2026-07-01T17:09:00Z"),
      paymentMethod: "stripe",
      stripePaymentId: "pi_test_3450",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: cheaper.id,
      optionIds: [],
    });

    expect(res.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // Le total de la prestation suit bien la correction…
    expect(updated.totalPriceCents).toBe(10000);
    // …mais l'acompte encaissé reste figé (pas recalculé à 3000).
    expect(updated.depositCents).toBe(3450);
  });

  it("notifie la cliente avec l'acompte réellement encaissé, pas le recalcul", async () => {
    // Ceinture-bretelles de la régression : l'email de modification doit porter
    // le montant réellement payé (34,50 €), jamais l'acompte recalculé (30 €).
    await makeAdmin();
    vi.mocked(buildBookingConfirmationEmail).mockClear();
    const paid = await makeService(230, 11500);
    const cheaper = await makeService(230, 10000);
    const booking = await makeBooking({
      serviceId: paid.id,
      startTime: "10:00",
      endTime: "13:50",
      totalDurationMinutes: 230,
      totalPriceCents: 11500,
      depositCents: 3450,
      paidAt: new Date("2026-07-01T17:09:00Z"),
      paymentMethod: "stripe",
      stripePaymentId: "pi_test_3450",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: cheaper.id,
      optionIds: [],
      notifyClient: true,
    });

    expect(res.ok).toBe(true);
    expect(buildBookingConfirmationEmail).toHaveBeenCalledTimes(1);
    const emailArg = vi.mocked(buildBookingConfirmationEmail).mock.calls[0][0];
    expect(emailArg.depositCents).toBe(3450);
  });

  it("remplace les options (delete + recreate)", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const opt1 = await makeOption(15, 1000);
    const opt2 = await makeOption(20, 2000);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:45",
      totalDurationMinutes: 45,
      totalPriceCents: 3500,
      optionIds: [opt1.id],
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: service.id,
      optionIds: [opt2.id],
    });

    expect(res.ok).toBe(true);
    const links = await db.bookingOption.findMany({ where: { bookingId: booking.id } });
    expect(links.map((l) => l.serviceOptionId)).toEqual([opt2.id]);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.totalDurationMinutes).toBe(50); // 30 + 20
    expect(updated.totalPriceCents).toBe(4500); // 2500 + 2000
  });

  it("refuse l'édition d'un RDV honoré (COMPLETED)", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
      status: "COMPLETED",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: service.id,
      optionIds: [],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("STATUS_NOT_EDITABLE");
  });

  it("avertit en cas de chevauchement, applique si force=true", async () => {
    await makeAdmin();
    const short = await makeService(30, 2500);
    const long = await makeService(60, 5000);
    // B1 10:00-10:30, B2 10:30-11:00 (adjacents, pas de chevauchement)
    const b1 = await makeBooking({ serviceId: short.id, startTime: "10:00", endTime: "10:30" });
    await makeBooking({ serviceId: short.id, startTime: "10:30", endTime: "11:00" });

    // Passer B1 sur la prestation longue → 10:00-11:00 chevauche B2.
    const warned = await updateBookingDetails(b1.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: long.id,
      optionIds: [],
    });
    expect(warned.ok).toBe(false);
    if (!warned.ok) expect(warned.code).toBe("OVERLAP");

    const forced = await updateBookingDetails(b1.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: long.id,
      optionIds: [],
      force: true,
    });
    expect(forced.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: b1.id } });
    expect(updated.totalDurationMinutes).toBe(60);
    expect(updated.endTime).toBe("11:00");
  });

  it("rejette un téléphone invalide via fieldErrors", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "12",
        message: null,
      },
      serviceId: service.id,
      optionIds: [],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION_ERROR");
      expect(res.fieldErrors?.["client.phone"]).toBeTruthy();
    }
  });
});

describe("updateBookingRevenue", () => {
  async function makeCompleted(revenueCents: number, method: string | null) {
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
      status: "COMPLETED",
    });
    return db.booking.update({
      where: { id: booking.id },
      data: { revenueCents, completionPaymentMethod: method },
    });
  }

  it("corrige le mode de règlement sans toucher au montant + trace l'audit", async () => {
    const admin = await makeAdmin();
    const booking = await makeCompleted(2500, "cash");

    const res = await updateBookingRevenue(booking.id, 2500, "card_terminal");

    expect(res.ok).toBe(true);
    const after = await db.booking.findUnique({ where: { id: booking.id } });
    expect(after?.revenueCents).toBe(2500);
    expect(after?.completionPaymentMethod).toBe("card_terminal");

    const logs = await db.auditLog.findMany({
      where: { adminId: admin.id, action: "booking.revenue_updated" },
    });
    expect(logs).toHaveLength(1);
    const meta = logs[0].metadata as Record<string, unknown>;
    expect(meta.previousCompletionPaymentMethod).toBe("cash");
    expect(meta.completionPaymentMethod).toBe("card_terminal");
  });

  it("exige un mode de règlement dès que le montant est > 0", async () => {
    await makeAdmin();
    const booking = await makeCompleted(2500, "cash");

    const res = await updateBookingRevenue(booking.id, 3000);

    expect(res.ok).toBe(false);
    const after = await db.booking.findUnique({ where: { id: booking.id } });
    expect(after?.revenueCents).toBe(2500);
  });

  it("force le mode à null quand le montant repasse à 0 (réglé 100% carte cadeau)", async () => {
    await makeAdmin();
    const booking = await makeCompleted(2500, "cash");

    const res = await updateBookingRevenue(booking.id, 0, "cash");

    expect(res.ok).toBe(true);
    const after = await db.booking.findUnique({ where: { id: booking.id } });
    expect(after?.revenueCents).toBe(0);
    expect(after?.completionPaymentMethod).toBeNull();
  });

  it("ne fait rien si montant et mode sont inchangés (pas d'audit)", async () => {
    const admin = await makeAdmin();
    const booking = await makeCompleted(2500, "cash");

    const res = await updateBookingRevenue(booking.id, 2500, "cash");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.message).toContain("Aucune modification");
    const logs = await db.auditLog.findMany({
      where: { adminId: admin.id, action: "booking.revenue_updated" },
    });
    expect(logs).toHaveLength(0);
  });

  it("refuse la modification sur un RDV non honoré", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
      status: "CONFIRMED",
    });

    const res = await updateBookingRevenue(booking.id, 2500, "cash");

    expect(res.ok).toBe(false);
  });
});
