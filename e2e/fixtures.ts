/**
 * Fixtures déterministes reseedées avant chaque run.
 * Couvre : admin, settings (flags ON, maintenance OFF), horaires, mois
 * réservables, 1 prestation, 1 ebook publié, 1 carte cadeau ACTIVE couvrant
 * l'ebook, 1 réservation AWAITING_DEPOSIT (pour le test admin).
 */
import bcrypt from "bcryptjs";
import { db } from "./db";

export const ADMIN_EMAIL = "chloe@clochette-nails.fr";
export const ADMIN_PASSWORD = "admin123";
export const E2E_GIFT_CODE = "GIFT-E2EE-CARD-2345";
export const E2E_EBOOK_SLUG = "guide-e2e";
export const E2E_AWAITING_BOOKING_ID = "e2e-booking-awaiting";

export async function seedBaseline(): Promise<void> {
  // 1. Admin
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await db.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: "Chloé",
      role: "ADMIN",
      hashedPassword,
      isActive: true,
    },
  });

  // 2. PlatformSettings (flags ON, maintenance OFF)
  await db.platformSettings.create({
    data: {
      businessName: "Clochette Nails",
      contactEmail: "contact@clochette-nails.fr",
      depositMode: "PERCENT",
      depositPercent: 30,
      bookingMinAdvanceHours: 72,
      bookingGranularityMinutes: 30,
      maintenanceMode: false,
      bookingsEnabled: true,
      giftCardsEnabled: true,
      ebooksEnabled: true,
    },
  });

  // 3. BusinessHours (Mar/Jeu/Ven/Sam ouverts)
  await db.businessHours.createMany({
    data: [
      { dayOfWeek: 0, isOpen: false },
      { dayOfWeek: 1, isOpen: false },
      { dayOfWeek: 2, isOpen: true, openingTime: "09:00", closingTime: "19:00", breakStart: "12:30", breakEnd: "13:30" },
      { dayOfWeek: 3, isOpen: false },
      { dayOfWeek: 4, isOpen: true, openingTime: "09:00", closingTime: "19:00", breakStart: "12:30", breakEnd: "13:30" },
      { dayOfWeek: 5, isOpen: true, openingTime: "09:00", closingTime: "19:00", breakStart: "12:30", breakEnd: "13:30" },
      { dayOfWeek: 6, isOpen: true, openingTime: "09:00", closingTime: "17:30" },
    ],
  });

  // 4. BookableMonth : courant + 2 suivants (sécurité fin de mois)
  const now = new Date();
  await db.bookableMonth.createMany({
    data: [0, 1, 2].map((add) => {
      const d = new Date(now.getFullYear(), now.getMonth() + add, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1, enabledById: admin.id };
    }),
  });

  // 5. Prestation (SOIN_MAINS : 30 min, sans option compatible → funnel simple)
  const soin = await db.service.create({
    data: {
      slug: "soin-mains",
      title: "Soin des mains — Manucure russe",
      shortDesc: "Soin complet : exfoliation, cuticules, modelage, hydratation.",
      description: "Soin complet des mains.",
      category: "SOIN_MAINS",
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });

  // 6. Ebook publié (pdfUrl + prix)
  await db.ebook.create({
    data: {
      slug: E2E_EBOOK_SLUG,
      title: "Guide E2E",
      shortDesc: "Guide utilisé par les tests automatisés.",
      description: "Contenu de test.",
      pdfUrl: "/uploads/ebooks/e2e.pdf",
      priceCents: 990,
      status: "PUBLISHED",
    },
  });

  // 7. Carte cadeau ACTIVE couvrant l'ebook (happy path ebook sans Stripe)
  await db.giftCard.create({
    data: {
      code: E2E_GIFT_CODE,
      codeHash: await bcrypt.hash(E2E_GIFT_CODE, 10),
      prefix: E2E_GIFT_CODE.slice(-4),
      status: "ACTIVE",
      initialAmountCents: 5000,
      remainingAmountCents: 5000,
      buyerEmail: "buyer@test.local",
      buyerName: "E2E Buyer",
      deliveryMode: "EMAIL_TO_BUYER",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      amount: 5000,
      paymentStatus: "PAID",
      creationMode: "PUBLIC",
    },
  });

  // 8. Réservation AWAITING_DEPOSIT (test admin : confirmation manuelle)
  const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  await db.booking.create({
    data: {
      id: E2E_AWAITING_BOOKING_ID,
      date: future,
      startTime: "10:00",
      endTime: "10:30",
      serviceId: soin.id,
      clientFirstName: "E2E",
      clientLastName: "Admin",
      clientEmail: "e2e-admin-booking@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 30,
      totalPriceCents: 2500,
      depositCents: 750,
      status: "AWAITING_DEPOSIT",
    },
  });
}
