"use server";

/**
 * Server Action — création d'une booking.
 *
 * Flow :
 *  1. Validation Zod (incluant honeypot)
 *  2. Rate limit par IP
 *  3. Re-check disponibilité (anti-race) avec transaction Prisma
 *  4. Snapshot pricing (totalDuration, totalPrice, deposit)
 *  5. Création Booking + BookingOption[] en transaction
 *  6. Stripe Checkout session OU fallback dev (auto-confirm)
 *  7. Outbound event "booking.created"
 *  8. Notification admin
 *  9. Retour { checkoutUrl } ou { confirmed, redirectUrl }
 */

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createBookingSchema, type CreateBookingInput } from "@/schemas/booking";
import {
  BOOKING_SUBMIT,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import {
  applyGiftCardRedemption,
  GiftCardRedemptionError,
} from "@/lib/gift-card-redeem";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { getClientIp } from "@/lib/client-ip";
import { computeDepositCents } from "@/lib/deposit";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { sendEmail } from "@/lib/email/send";
import { ADMIN_EMAIL } from "@/lib/email/client";
import { buildBookingConfirmationEmail } from "@/lib/email/templates/booking-confirmation";
import { buildBookingNotifAdminEmail } from "@/lib/email/templates/booking-notif-admin";

export type CreateBookingResult =
  | { ok: true; checkoutUrl: string }
  | { ok: true; confirmed: true; redirectUrl: string }
  | {
      ok: false;
      error: string;
      code:
        | "VALIDATION_ERROR"
        | "RATE_LIMITED"
        | "SLOT_TAKEN"
        | "SERVICE_NOT_FOUND"
        | "BOOKINGS_DISABLED"
        | "GIFT_CARD_INVALID"
        | "GIFT_CARD_EXPIRED"
        | "RECAPTCHA_FAILED"
        | "INTERNAL_ERROR";
      fieldErrors?: Record<string, string>;
    };

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// computeDepositCents extrait dans @/lib/deposit.ts (shared server + client)

export async function createBookingAction(
  raw: CreateBookingInput,
): Promise<CreateBookingResult> {
  // ── 1. Validation Zod ───────────────────────────────────
  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: "Veuillez vérifier les champs",
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }
  const data = parsed.data;

  // Honeypot : reject silencieux après délai aléatoire
  if (data.honeypot && data.honeypot.length > 0) {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    return {
      ok: true,
      confirmed: true,
      redirectUrl: "/", // fake success URL
    };
  }

  // ── 2. Rate limit ───────────────────────────────────────
  const h = await headers();
  const ip = getClientIp(h);

  // reCAPTCHA v3 (skip si pas de clé serveur → dev ; fail-open si Google down)
  const captcha = await verifyRecaptcha(data.recaptchaToken, "booking", ip);
  if (!captcha.ok) {
    return {
      ok: false,
      error: "La vérification de sécurité a échoué. Merci de réessayer.",
      code: "RECAPTCHA_FAILED",
    };
  }

  const rl = checkRateLimit(
    BOOKING_SUBMIT.bucket,
    ip,
    BOOKING_SUBMIT.max,
    BOOKING_SUBMIT.windowMs,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
      code: "RATE_LIMITED",
    };
  }
  recordRateLimit(BOOKING_SUBMIT.bucket, ip, BOOKING_SUBMIT.windowMs);

  try {
    // ── 3. Fetch service + options + settings ─────────────
    const [service, options, settings] = await Promise.all([
      prisma.service.findUnique({
        where: { id: data.serviceId, status: "PUBLISHED" },
        select: {
          id: true,
          title: true,
          durationMinutes: true,
          priceCents: true,
        },
      }),
      data.optionIds.length > 0
        ? prisma.serviceOption.findMany({
            where: { id: { in: data.optionIds }, status: "PUBLISHED" },
            select: {
              id: true,
              title: true,
              addedDurationMinutes: true,
              addedPriceCents: true,
            },
          })
        : Promise.resolve([]),
      prisma.platformSettings.findFirst(),
    ]);

    if (!service) {
      return {
        ok: false,
        error: "Prestation introuvable",
        code: "SERVICE_NOT_FOUND",
      };
    }

    if (settings && !settings.bookingsEnabled) {
      return {
        ok: false,
        error: "Les réservations sont temporairement désactivées.",
        code: "BOOKINGS_DISABLED",
      };
    }

    // ── 4. Snapshot pricing ───────────────────────────────
    const totalDurationMinutes =
      service.durationMinutes +
      options.reduce((sum, o) => sum + o.addedDurationMinutes, 0);
    const totalPriceCents =
      service.priceCents +
      options.reduce((sum, o) => sum + o.addedPriceCents, 0);
    const endTime = addMinutes(data.startTime, totalDurationMinutes);
    const depositCents = settings
      ? computeDepositCents(totalPriceCents, settings)
      : Math.round(totalPriceCents * 0.3);

    // ── 4bis. Gift card (optionnel) ───────────────────────
    let giftCardId: string | null = null;
    let giftCardAmountToUse = 0;
    if (data.giftCardCode) {
      const trimmed = data.giftCardCode.trim().toUpperCase();
      if (trimmed) {
        const card = await prisma.giftCard.findUnique({
          where: { code: trimmed },
          select: {
            id: true,
            status: true,
            remainingAmountCents: true,
            expiresAt: true,
          },
        });
        if (!card) {
          return {
            ok: false,
            error: "Code cadeau introuvable.",
            code: "GIFT_CARD_INVALID",
          };
        }
        if (card.status !== "ACTIVE" && card.status !== "PARTIALLY_USED") {
          return {
            ok: false,
            error: "Code cadeau non utilisable.",
            code: "GIFT_CARD_INVALID",
          };
        }
        if (card.expiresAt < new Date()) {
          return {
            ok: false,
            error: "Code cadeau expiré.",
            code: "GIFT_CARD_EXPIRED",
          };
        }
        if (card.remainingAmountCents <= 0) {
          return {
            ok: false,
            error: "Code cadeau épuisé.",
            code: "GIFT_CARD_INVALID",
          };
        }
        giftCardId = card.id;
        giftCardAmountToUse = Math.min(
          card.remainingAmountCents,
          depositCents,
        );
      }
    }
    const adjustedDepositCents = depositCents - giftCardAmountToUse;

    // ── 5. Anti-race : re-check dispo + INSERT en transaction ─
    const date = new Date(data.date + "T00:00:00Z");

    const booking = await prisma.$transaction(async (tx) => {
      // Re-check dispo (au moment de l'INSERT, peut avoir changé)
      const conflict = await tx.booking.findFirst({
        where: {
          date,
          status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gt: data.startTime } },
          ],
        },
        select: { id: true },
      });
      if (conflict) {
        throw new BookingConflictError();
      }

      // Confirmation token pour /succes page
      const confirmationToken = randomBytes(24).toString("base64url");

      return tx.booking.create({
        data: {
          date,
          startTime: data.startTime,
          endTime,
          serviceId: data.serviceId,
          clientFirstName: data.client.firstName,
          clientLastName: data.client.lastName,
          clientEmail: data.client.email,
          clientPhone: data.client.phone,
          clientMessage: data.client.message || null,
          totalDurationMinutes,
          totalPriceCents,
          depositCents,
          pendingGiftCardId: giftCardId,
          pendingGiftCardAmountCents: giftCardAmountToUse || null,
          status: "AWAITING_DEPOSIT",
          confirmationToken,
          options: {
            create: data.optionIds.map((id) => ({ serviceOptionId: id })),
          },
          files: {
            // Les URLs ont déjà été validées par le schéma Zod (regex stricte
            // sur le dossier /uploads/booking-files/UUID.webp).
            create: data.photoUrls.map((p) => ({
              url: p.url,
              originalName: p.originalName,
              mimeType: p.mimeType,
              sizeBytes: p.sizeBytes,
            })),
          },
        },
        select: { id: true, confirmationToken: true, depositCents: true },
      });
    });

    // ── 6. Branchements paiement ───────────────────────────
    const origin =
      h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // ── 6a. Gift card couvre tout : skip Stripe, auto-confirm + redeem
    if (giftCardId && adjustedDepositCents === 0) {
      try {
        await applyGiftCardRedemption({
          giftCardId,
          amountCents: giftCardAmountToUse,
          bookingId: booking.id,
          redeemedByEmail: data.client.email,
        });
      } catch (err) {
        // Rollback : on annule le booking si la carte n'a pas pu être débitée
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: "EXPIRED",
            cancelledAt: new Date(),
            cancellationReason: "Échec redemption carte cadeau",
          },
        });
        const msg =
          err instanceof GiftCardRedemptionError
            ? err.message
            : "Carte cadeau indisponible. Réessayez sans le code.";
        return {
          ok: false,
          error: msg,
          code: "GIFT_CARD_INVALID",
        };
      }

      const now = new Date();
      const clientActionToken = randomBytes(32).toString("hex");
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: now,
          paidAt: now,
          clientActionToken,
          paymentMethod: "gift_card_full",
        },
      });

      await emitOutboundEvent("booking.confirmed", {
        bookingId: booking.id,
        paidVia: "gift_card_full",
        depositCents: booking.depositCents,
        giftCardAmountUsed: giftCardAmountToUse,
        clientFirstName: data.client.firstName,
        clientLastName: data.client.lastName,
        clientEmail: data.client.email,
        clientPhone: data.client.phone,
        serviceId: data.serviceId,
        serviceTitle: service.title,
        date: data.date,
        startTime: data.startTime,
        endTime,
      });
      await notifyAdmin(booking.id, service.title, data.client.email);

      const siteUrlAbs =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
      const absolutePhotoUrls = data.photoUrls.map(
        (p) => `${siteUrlAbs}${p.url}`,
      );

      // Emails (fire-and-log : ne bloque pas la réservation si Resend down)
      await sendBookingEmails({
        bookingId: booking.id,
        clientFirstName: data.client.firstName,
        clientLastName: data.client.lastName,
        clientEmail: data.client.email,
        clientPhone: data.client.phone,
        clientMessage: data.client.message ?? null,
        serviceTitle: service.title,
        optionsTitles: options.map((o) => o.title),
        date,
        startTime: data.startTime,
        endTime,
        totalDurationMinutes,
        depositCents: booking.depositCents,
        giftCardAmountCents: giftCardAmountToUse,
        paidVia: "gift_card_full",
        clientActionToken,
        photoUrls: absolutePhotoUrls,
      });

      return {
        ok: true,
        confirmed: true,
        redirectUrl: `/reservation/succes?token=${booking.confirmationToken}`,
      };
    }

    // ── 6b. Vrai flow Stripe (avec ou sans gift card partielle)
    if (stripe) {
      // Délai public : 30 min (admin = 24h, géré côté createBookingAdmin)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Acompte — ${service.title}`,
                description: `RDV du ${formatDateFr(date)} à ${data.startTime}`,
              },
              unit_amount: adjustedDepositCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "booking",
          bookingId: booking.id,
          ...(giftCardId
            ? {
                giftCardId,
                giftCardAmountCents: String(giftCardAmountToUse),
              }
            : {}),
        },
        customer_email: data.client.email,
        locale: "fr",
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${origin}/reservation/succes?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/reservation/echec?token=${booking.confirmationToken}`,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          stripeSessionId: session.id,
          paymentExpiresAt: expiresAt,
        },
      });

      await emitOutboundEvent("booking.created", {
        bookingId: booking.id,
        serviceId: data.serviceId,
        serviceTitle: service.title,
        date: data.date,
        startTime: data.startTime,
        depositCents: booking.depositCents,
        adjustedDepositCents,
        giftCardAmountUsed: giftCardAmountToUse,
        clientEmail: data.client.email,
        clientFirstName: data.client.firstName,
        clientLastName: data.client.lastName,
        clientPhone: data.client.phone,
      });

      return { ok: true, checkoutUrl: session.url! };
    }

    // ── 6c. Dev fallback (sans Stripe) : auto-confirm + redeem si gift card
    if (giftCardId && giftCardAmountToUse > 0) {
      try {
        await applyGiftCardRedemption({
          giftCardId,
          amountCents: giftCardAmountToUse,
          bookingId: booking.id,
          redeemedByEmail: data.client.email,
        });
      } catch (err) {
        console.error("[dev fallback] gift card redemption failed:", err);
      }
    }
    const devClientActionToken = randomBytes(32).toString("hex");
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        paidAt: new Date(),
        clientActionToken: devClientActionToken,
        paymentMethod: giftCardId ? "gift_card_full" : "stripe",
      },
    });

    const devPaidVia = giftCardId ? "gift_card_dev_fallback" : "dev_fallback";
    await emitOutboundEvent("booking.confirmed", {
      bookingId: booking.id,
      paidVia: devPaidVia,
      depositCents: booking.depositCents,
    });

    await notifyAdmin(booking.id, service.title, data.client.email);

    const siteUrlAbsDev =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
    const absolutePhotoUrlsDev = data.photoUrls.map(
      (p) => `${siteUrlAbsDev}${p.url}`,
    );

    await sendBookingEmails({
      bookingId: booking.id,
      clientFirstName: data.client.firstName,
      clientLastName: data.client.lastName,
      clientEmail: data.client.email,
      clientPhone: data.client.phone,
      clientMessage: data.client.message ?? null,
      serviceTitle: service.title,
      optionsTitles: options.map((o) => o.title),
      date,
      startTime: data.startTime,
      endTime,
      totalDurationMinutes,
      depositCents: booking.depositCents,
      giftCardAmountCents: giftCardAmountToUse,
      paidVia: devPaidVia,
      clientActionToken: devClientActionToken,
      photoUrls: absolutePhotoUrlsDev,
    });

    return {
      ok: true,
      confirmed: true,
      redirectUrl: `/reservation/succes?token=${booking.confirmationToken}`,
    };
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return {
        ok: false,
        error: "Ce créneau vient d'être réservé. Choisissez-en un autre.",
        code: "SLOT_TAKEN",
      };
    }
    console.error("[createBookingAction] error:", err);
    return {
      ok: false,
      error: "Une erreur est survenue. Réessayez dans un instant.",
      code: "INTERNAL_ERROR",
    };
  }
}

// ── Helpers ──────────────────────────────────────────────

class BookingConflictError extends Error {
  constructor() {
    super("SLOT_TAKEN");
    this.name = "BookingConflictError";
  }
}

async function notifyAdmin(
  bookingId: string,
  serviceTitle: string,
  clientEmail: string,
): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin) return;

  await prisma.notification.create({
    data: {
      userId: admin.id,
      type: "NEW_BOOKING",
      title: `Nouvelle réservation : ${serviceTitle}`,
      body: `Client : ${clientEmail}`,
      link: `/admin/bookings/${bookingId}`,
    },
  });
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Helper d'envoi des 2 emails post-confirmation (cliente + admin).
 * Catch tout en interne — ne bloque jamais le flow de booking si Resend
 * est down ou non configuré.
 */
type BookingEmailInput = {
  bookingId: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  clientMessage: string | null;
  serviceTitle: string;
  optionsTitles: string[];
  date: Date;
  startTime: string;
  endTime: string;
  totalDurationMinutes: number;
  depositCents: number;
  giftCardAmountCents: number;
  paidVia: string;
  clientActionToken?: string;
  /** URLs absolues (siteUrl + /uploads/…) des photos jointes. */
  photoUrls?: string[];
};

async function sendBookingEmails(input: BookingEmailInput): Promise<void> {
  // Email cliente
  try {
    const clientMail = buildBookingConfirmationEmail({
      clientFirstName: input.clientFirstName,
      clientEmail: input.clientEmail,
      serviceTitle: input.serviceTitle,
      optionsTitles: input.optionsTitles,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      totalDurationMinutes: input.totalDurationMinutes,
      depositCents: input.depositCents,
      giftCardAmountCents: input.giftCardAmountCents,
      clientActionToken: input.clientActionToken,
    });
    await sendEmail({
      to: input.clientEmail,
      subject: clientMail.subject,
      html: clientMail.html,
      text: clientMail.text,
      tag: "booking.confirmation",
    });
  } catch (err) {
    console.error(
      `[booking emails] cliente échoué pour ${input.bookingId}:`,
      err,
    );
  }

  // Email admin
  try {
    const adminMail = buildBookingNotifAdminEmail({
      bookingId: input.bookingId,
      serviceTitle: input.serviceTitle,
      clientFirstName: input.clientFirstName,
      clientLastName: input.clientLastName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      clientMessage: input.clientMessage,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      depositCents: input.depositCents,
      giftCardAmountCents: input.giftCardAmountCents,
      paidVia: input.paidVia,
      photoUrls: input.photoUrls,
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: input.clientEmail,
      tag: "booking.notif-admin",
    });
  } catch (err) {
    console.error(
      `[booking emails] admin échoué pour ${input.bookingId}:`,
      err,
    );
  }
}
