/**
 * Backfill — reconstruit les events historiques depuis les tables source et les
 * seede dans `OutboundEvent` (le worker les livre ensuite). Nécessaire car la
 * queue était log-only avant l'activation de l'ERP → sans ça l'ERP démarre vide.
 *
 *  - `eventId` DÉTERMINISTE `backfill:<type>:<sourceId>` → re-run idempotent
 *    (dedup par findFirst sur eventId).
 *  - `before` (cutover) : ne reconstruit que les faits ANTÉRIEURS (évite le
 *    double-comptage avec les events live émis après l'activation).
 *
 * 0a : on reconstruit booking.completed (le CA réel des RDV honorés). Les autres
 * types (invoice.issued, gift_card.*, ebook.purchased) suivent le même patron et
 * s'ajouteront avec 0b (quand la projection définira les payloads exacts).
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BackfillDeps = { db?: PrismaClient; before?: Date };

export async function backfillOutbound(deps: BackfillDeps = {}) {
  const db = deps.db ?? prisma;
  const before = deps.before ?? new Date();
  const targetUrl = process.env.MANAGEMENT_API_URL ?? "";
  if (!targetUrl) {
    return { seeded: 0, skipped: 0, reason: "MANAGEMENT_API_URL non configuré" };
  }

  let seeded = 0;
  let skipped = 0;

  async function seed(
    type: string,
    sourceId: string,
    createdAt: Date,
    payload: object,
  ) {
    const eventId = `backfill:${type}:${sourceId}`;
    const exists = await db.outboundEvent.findFirst({
      where: { eventId },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      return;
    }
    await db.outboundEvent.create({
      data: { eventId, type, payload, targetUrl, targetService: "management", createdAt },
    });
    seeded++;
  }

  // RDV honorés (COMPLETED) = le CA réel → booking.completed
  const completed = await db.booking.findMany({
    where: { status: "COMPLETED", createdAt: { lt: before } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      revenueCents: true,
      completionPaymentMethod: true,
      date: true,
      startTime: true,
      serviceId: true,
      clientEmail: true,
      createdAt: true,
    },
  });
  for (const b of completed) {
    await seed("booking.completed", b.id, b.createdAt, {
      bookingId: b.id,
      revenueCents: b.revenueCents,
      completionPaymentMethod: b.completionPaymentMethod,
      date: b.date.toISOString().slice(0, 10),
      startTime: b.startTime,
      serviceId: b.serviceId,
      clientEmail: b.clientEmail,
    });
  }

  return { seeded, skipped };
}
