"use server";

/**
 * Server Actions — renvoi manuel des rappels RDV par mail.
 *
 * Le cron `send-booking-reminders` s'occupe des envois automatiques. Cette
 * action permet à l'admin de renvoyer manuellement un rappel J-7 ou J-1
 * depuis le détail d'un booking (si la cliente a perdu le mail, par ex.).
 *
 * Met à jour `reminderJ7SentAt` / `reminderJ1SentAt` à l'envoi.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { loadEmailGlobals } from "@/lib/email/globals";
import {
  buildBookingReminderJ1Email,
  buildBookingReminderJ7Email,
} from "@/lib/email/templates/booking-reminder";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function resendBookingReminder(
  bookingId: string,
  type: "J7" | "J1",
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Non autorisé" };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientEmail: true,
      clientFirstName: true,
      date: true,
      startTime: true,
      endTime: true,
      totalDurationMinutes: true,
      clientActionToken: true,
      service: { select: { title: true } },
      options: {
        select: { serviceOption: { select: { title: true } } },
      },
    },
  });
  if (!booking) return { ok: false, error: "Réservation introuvable." };

  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: "Seules les réservations confirmées peuvent recevoir un rappel.",
    };
  }

  const globals = await loadEmailGlobals();
  const input = {
    clientFirstName: booking.clientFirstName,
    serviceTitle: booking.service.title,
    optionsTitles: booking.options.map((o) => o.serviceOption.title),
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalDurationMinutes: booking.totalDurationMinutes,
    clientActionToken: booking.clientActionToken,
    contactPhone: globals.contactPhone,
  };

  const mail =
    type === "J7"
      ? buildBookingReminderJ7Email(input)
      : buildBookingReminderJ1Email(input);

  const r = await sendEmail({
    to: booking.clientEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: type === "J7" ? "booking.reminder.j7" : "booking.reminder.j1",
  });
  if (!r.ok) return { ok: false, error: `Envoi échoué : ${r.error}` };

  // Renvoi = nouvel email → nouveau messageId + on réinitialise le tracking
  // (l'open/bounce de l'envoi précédent ne vaut plus pour ce nouveau mail).
  await prisma.booking.update({
    where: { id: booking.id },
    data:
      type === "J7"
        ? {
            reminderJ7SentAt: new Date(),
            reminderJ7MessageId: r.id ?? null,
            reminderJ7OpenedAt: null,
            reminderJ7BouncedAt: null,
          }
        : {
            reminderJ1SentAt: new Date(),
            reminderJ1MessageId: r.id ?? null,
            reminderJ1OpenedAt: null,
            reminderJ1BouncedAt: null,
          },
  });

  // Audit
  try {
    await prisma.auditLog.create({
      data: {
        adminId: session.user.id,
        action: `booking.reminder_${type.toLowerCase()}_resent`,
        metadata: { bookingId } as object,
      },
    });
  } catch {
    // Best effort
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  return {
    ok: true,
    message: `Rappel ${type === "J7" ? "J-7" : "J-1"} envoyé à ${booking.clientEmail}.`,
  };
}
