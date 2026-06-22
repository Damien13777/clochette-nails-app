/**
 * Applique un event Resend (ouverture / bounce) d'un email de rappel RDV au
 * Booking correspondant, matché par le messageId Resend stocké à l'envoi
 * (`reminderJ7MessageId` / `reminderJ1MessageId`).
 *
 * Idempotent : l'ouverture ne retient que la 1re (updateMany conditionné à
 * `openedAt: null`), idem bounce. Retourne `true` si un booking a matché —
 * permet au webhook de distinguer un rappel d'un mail non tracké.
 */

import { prisma } from "@/lib/prisma";

export async function recordReminderEmailEvent(
  messageId: string,
  type: "opened" | "bounced",
  at: Date,
): Promise<boolean> {
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [
        { reminderJ7MessageId: messageId },
        { reminderJ1MessageId: messageId },
      ],
    },
    select: { id: true, reminderJ7MessageId: true },
  });
  if (!booking) return false;

  const isJ7 = booking.reminderJ7MessageId === messageId;

  if (type === "opened") {
    await prisma.booking.updateMany({
      where: isJ7
        ? { id: booking.id, reminderJ7OpenedAt: null }
        : { id: booking.id, reminderJ1OpenedAt: null },
      data: isJ7 ? { reminderJ7OpenedAt: at } : { reminderJ1OpenedAt: at },
    });
  } else {
    await prisma.booking.updateMany({
      where: isJ7
        ? { id: booking.id, reminderJ7BouncedAt: null }
        : { id: booking.id, reminderJ1BouncedAt: null },
      data: isJ7 ? { reminderJ7BouncedAt: at } : { reminderJ1BouncedAt: at },
    });
  }
  return true;
}
