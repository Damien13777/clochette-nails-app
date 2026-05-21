/**
 * Cron : envoie les rappels de RDV par mail aux clientes.
 *
 *  - J-7 : 1 semaine avant le RDV (rappel doux + propose de déplacer)
 *  - J-1 : la veille du RDV (rappel ferme "à demain !")
 *
 * Schedule prévu (Vercel) : every 5 minutes (cf. vercel.json).
 * Auth : Authorization: Bearer <CRON_SECRET>
 *
 * Filtres systématiques :
 *  - status === "CONFIRMED" (les AWAITING_DEPOSIT / CANCELLED / COMPLETED skip)
 *  - reminderJ7SentAt is null (idempotence J-7)
 *  - reminderJ1SentAt is null (idempotence J-1)
 *  - date == today + 7  (J-7)  OU  date == today + 1  (J-1)
 *
 * Fenêtre horaire : pour éviter d'envoyer à 4h du matin, le cron skip
 * silencieusement entre 21h et 8h Paris. Donc même s'il run en pleine
 * nuit, aucun mail ne part.
 *
 * Promesse RGPD : ce rappel J-1 est mentionné dans /confidentialite.
 *
 * Test local :
 *  curl -H "Authorization: Bearer $CRON_SECRET" \
 *    http://localhost:3000/api/v1/cron/send-booking-reminders
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfTodayParisAsUtc } from "@/lib/paris-day";
import { sendEmail } from "@/lib/email/send";
import { loadEmailGlobals } from "@/lib/email/globals";
import {
  buildBookingReminderJ1Email,
  buildBookingReminderJ7Email,
} from "@/lib/email/templates/booking-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 50; // Sécurité : max 50 rappels par run
const SEND_WINDOW_START_HOUR_PARIS = 8; // pas avant 8h
const SEND_WINDOW_END_HOUR_PARIS = 21; // pas après 21h

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron reminders] CRON_SECRET non configuré");
    return NextResponse.json(
      { error: "CRON_SECRET non configuré" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fenêtre horaire Paris (skip nuit)
  const hourParis = parisHour();
  if (
    hourParis < SEND_WINDOW_START_HOUR_PARIS ||
    hourParis >= SEND_WINDOW_END_HOUR_PARIS
  ) {
    return NextResponse.json({
      ok: true,
      skipped: "outside_send_window",
      hourParis,
    });
  }

  const today = startOfTodayParisAsUtc();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const inSevenDays = new Date(today);
  inSevenDays.setUTCDate(inSevenDays.getUTCDate() + 7);

  const [j7Bookings, j1Bookings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        date: inSevenDays,
        reminderJ7SentAt: null,
      },
      take: BATCH_LIMIT,
      select: bookingSelect(),
    }),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        date: tomorrow,
        reminderJ1SentAt: null,
      },
      take: BATCH_LIMIT,
      select: bookingSelect(),
    }),
  ]);

  const globals = await loadEmailGlobals();
  const results: Array<{ id: string; type: "J-7" | "J-1"; status: "ok" | "ko"; reason?: string }> = [];

  for (const b of j7Bookings) {
    const r = await sendReminder("J-7", b, globals.contactPhone);
    results.push({ id: b.id, type: "J-7", ...r });
  }
  for (const b of j1Bookings) {
    const r = await sendReminder("J-1", b, globals.contactPhone);
    results.push({ id: b.id, type: "J-1", ...r });
  }

  if (results.length > 0) {
    console.log(
      `[cron reminders] ${results.length} envoi(s) :`,
      results.map((r) => `${r.id} ${r.type} ${r.status}`).join(", "),
    );
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

// ─── Helpers ────────────────────────────────────────────────

type BookingWithDetails = Awaited<ReturnType<typeof loadBooking>>;

function bookingSelect() {
  return {
    id: true,
    clientFirstName: true,
    clientEmail: true,
    date: true,
    startTime: true,
    endTime: true,
    totalDurationMinutes: true,
    clientActionToken: true,
    service: { select: { title: true } },
    options: {
      select: { serviceOption: { select: { title: true } } },
    },
  } as const;
}

// Pour le type seulement
async function loadBooking() {
  return prisma.booking.findFirst({ select: bookingSelect() });
}

async function sendReminder(
  type: "J-7" | "J-1",
  booking: NonNullable<BookingWithDetails>,
  contactPhone: string,
): Promise<{ status: "ok" | "ko"; reason?: string }> {
  const input = {
    clientFirstName: booking.clientFirstName,
    serviceTitle: booking.service.title,
    optionsTitles: booking.options.map((o) => o.serviceOption.title),
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalDurationMinutes: booking.totalDurationMinutes,
    clientActionToken: booking.clientActionToken,
    contactPhone,
  };

  const mail =
    type === "J-7"
      ? buildBookingReminderJ7Email(input)
      : buildBookingReminderJ1Email(input);

  try {
    const r = await sendEmail({
      to: booking.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: type === "J-7" ? "booking.reminder.j7" : "booking.reminder.j1",
    });
    if (!r.ok) {
      console.error(
        `[cron reminders] ${type} échec pour ${booking.id}: ${r.error}`,
      );
      return { status: "ko", reason: r.error };
    }
    // Marque envoyé pour idempotence
    await prisma.booking.update({
      where: { id: booking.id },
      data:
        type === "J-7"
          ? { reminderJ7SentAt: new Date() }
          : { reminderJ1SentAt: new Date() },
    });
    return { status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erreur inconnue";
    console.error(
      `[cron reminders] ${type} exception pour ${booking.id}:`,
      err,
    );
    return { status: "ko", reason: msg };
  }
}

/** Renvoie l'heure courante à Paris (0-23). */
function parisHour(): number {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(fmt.format(new Date()), 10);
}
