/**
 * Cron : expire les bookings AWAITING_DEPOSIT dont le délai de paiement est dépassé.
 *
 * Schedule : toutes les 5 min via crontab VPS (curl + Bearer CRON_SECRET).
 * Auth : Authorization: Bearer <CRON_SECRET>
 *
 * Logique :
 *  - Si paymentExpiresAt est défini → expire si paymentExpiresAt < now
 *    (30 min pour bookings publics, 24 h pour bookings admin avec lien)
 *  - Si paymentExpiresAt est null → fallback legacy : createdAt + 30 min
 *
 * Effet :
 *  - status: AWAITING_DEPOSIT → EXPIRED
 *  - cancelledAt = now
 *  - cancellationReason = "Délai de paiement dépassé"
 *  - emit OutboundEvent "booking.expired" (si MANAGEMENT_API_URL configurée)
 *
 * Race condition :
 *  Stripe Checkout est configurée avec `expires_at` égal à `paymentExpiresAt`,
 *  donc le paiement ne peut pas aboutir après ce délai. Aucun risque de
 *  confirmer une booking déjà expirée par ce cron.
 *
 * Test local :
 *  curl -H "Authorization: Bearer $CRON_SECRET" \
 *    http://localhost:3000/api/v1/cron/expire-pending
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_EXPIRY_MINUTES = 30; // Fallback pour bookings sans paymentExpiresAt
const BATCH_LIMIT = 100; // Garde-fou : max 100 expirations par run

export async function GET(request: Request) {
  // ── Auth ───────────────────────────────────────────────
  const cronAuth = verifyCronAuth(request);
  if (!cronAuth.ok) {
    return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status });
  }

  // ── Query candidates ──────────────────────────────────
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - LEGACY_EXPIRY_MINUTES * 60 * 1000);

  const candidates = await prisma.booking.findMany({
    where: {
      status: "AWAITING_DEPOSIT",
      OR: [
        // Nouveau : utilise paymentExpiresAt si défini
        { paymentExpiresAt: { lt: now } },
        // Legacy : si paymentExpiresAt null → fallback createdAt + 30 min
        {
          AND: [
            { paymentExpiresAt: null },
            { createdAt: { lt: legacyCutoff } },
          ],
        },
      ],
    },
    select: {
      id: true,
      serviceId: true,
      date: true,
      startTime: true,
      clientEmail: true,
      clientFirstName: true,
      clientLastName: true,
    },
    take: BATCH_LIMIT,
    orderBy: { createdAt: "asc" },
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      expired: 0,
      now: now.toISOString(),
    });
  }

  // ── Bulk expire ───────────────────────────────────────
  const ids = candidates.map((b) => b.id);

  // Re-check status dans le WHERE pour idempotence (au cas où un webhook
  // a confirmé pile entre le findMany et l'updateMany)
  const result = await prisma.booking.updateMany({
    where: { id: { in: ids }, status: "AWAITING_DEPOSIT" },
    data: {
      status: "EXPIRED",
      cancelledAt: now,
      cancellationReason: "Délai de paiement dépassé",
    },
  });

  // ── Notif admin in-app : prévenir Chloé des expirations (relance possible) ──
  if (result.count > 0) {
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUser) {
      await prisma.notification.createMany({
        data: candidates.map((b) => ({
          userId: adminUser.id,
          type: "BOOKING_CANCELLED" as const,
          title: `RDV expiré (acompte non réglé) : ${b.clientFirstName} ${b.clientLastName}`,
          body: `${b.date.toISOString().slice(0, 10)} à ${b.startTime} — créneau libéré. Relance possible.`,
          link: `/admin/bookings/${b.id}`,
          metadata: { bookingId: b.id, reason: "payment_expired" } as object,
        })),
      });
    }
  }

  // ── Outbound events ───────────────────────────────────
  const targetUrl = process.env.MANAGEMENT_API_URL;
  if (targetUrl && result.count > 0) {
    await prisma.outboundEvent.createMany({
      data: candidates.map((b) => ({
        type: "booking.expired",
        payload: {
          bookingId: b.id,
          serviceId: b.serviceId,
          date: b.date.toISOString().slice(0, 10),
          startTime: b.startTime,
          clientEmail: b.clientEmail,
        } as object,
        targetUrl,
        targetService: "management",
      })),
    });
  } else if (result.count > 0) {
    console.log(
      `[cron expire-pending] ${result.count} booking(s) expirée(s) :`,
    );
    for (const b of candidates) {
      console.log(
        `  - ${b.id} (${b.date.toISOString().slice(0, 10)} ${b.startTime}, ${b.clientEmail})`,
      );
    }
  }

  return NextResponse.json({
    expired: result.count,
    candidates: candidates.length,
    now: now.toISOString(),
  });
}
