/**
 * POST /api/webhooks/resend
 *
 * Réception des events Resend (https://resend.com/docs/dashboard/webhooks/introduction)
 * pour tracker les newsletters envoyées :
 *  - email.sent / email.delivered
 *  - email.opened (tracking ouvertures)
 *  - email.clicked (tracking clics)
 *  - email.bounced (hard bounce)
 *  - email.complained (marqué spam)
 *  - email.delivery_delayed
 *
 * On matche chaque event sur NewsletterDelivery.resendMessageId (stocké au
 * moment de l'envoi). Met à jour le status + les timestamps + les compteurs.
 *
 * Sécurité (Svix) :
 *  Resend signe ses webhooks via Svix. Headers : svix-id, svix-timestamp,
 *  svix-signature. Signed payload : `{id}.{timestamp}.{body}` avec HMAC-SHA256
 *  + secret en base64.
 *
 *  En dev local sans secret configuré → on log un warning et on traite
 *  quand même (utile pour tester avec Resend → stripe-cli forward). En prod,
 *  RESEND_WEBHOOK_SECRET doit être set sinon on refuse 503.
 *
 * Idempotence : Resend peut renvoyer le même event en cas de timeout. Notre
 * upsert/update par messageId est naturellement idempotent (un même open
 * incrémente openCount, mais firstOpenedAt n'est set qu'à la première fois).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordReminderEmailEvent } from "@/lib/reminder-email-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.failed";

type ResendEvent = {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    [k: string]: unknown;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  // Vérif signature Svix si secret configuré
  if (secret) {
    const verified = verifySvixSignature(request.headers, rawBody, secret);
    if (!verified) {
      return NextResponse.json(
        { error: "Signature webhook invalide" },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error(
      "[resend webhook] RESEND_WEBHOOK_SECRET non configuré en production",
    );
    return NextResponse.json(
      { error: "Webhook secret manquant" },
      { status: 503 },
    );
  } else {
    console.warn(
      "[resend webhook] RESEND_WEBHOOK_SECRET non configuré (dev) — vérif signature désactivée",
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const messageId = event.data?.email_id;
  if (!messageId) {
    console.warn("[resend webhook] event sans email_id :", event.type);
    return NextResponse.json({ ok: true, ignored: "no_email_id" });
  }

  // On ne traite que les events liés à une NewsletterDelivery connue.
  // Resend nous renvoie aussi des events pour les autres mails (booking,
  // gift card, ebook), qu'on ignore proprement.
  const delivery = await prisma.newsletterDelivery.findUnique({
    where: { resendMessageId: messageId },
    select: {
      id: true,
      campaignId: true,
      status: true,
      firstOpenedAt: true,
      firstClickedAt: true,
    },
  });

  if (!delivery) {
    // Pas une newsletter → peut-être un rappel RDV : on tracke open + bounce.
    if (event.type === "email.opened" || event.type === "email.bounced") {
      const matched = await recordReminderEmailEvent(
        messageId,
        event.type === "email.opened" ? "opened" : "bounced",
        new Date(),
      );
      if (matched) {
        return NextResponse.json({ ok: true, reminder: event.type });
      }
    }
    return NextResponse.json({ ok: true, ignored: "not_tracked" });
  }

  await handleResendEvent(event, delivery);
  return NextResponse.json({ ok: true });
}

type DeliveryRef = {
  id: string;
  campaignId: string;
  status: string;
  firstOpenedAt: Date | null;
  firstClickedAt: Date | null;
};

async function handleResendEvent(event: ResendEvent, delivery: DeliveryRef): Promise<void> {
  const now = new Date();

  switch (event.type) {
    case "email.delivered": {
      await prisma.newsletterDelivery.updateMany({
        where: {
          id: delivery.id,
          // N'écrase pas un status terminal "fort" (OPENED, CLICKED…)
          status: { in: ["PENDING", "SENT"] },
        },
        data: { status: "DELIVERED", deliveredAt: now },
      });
      await incCampaignCounter(delivery.campaignId, "deliveredCount");
      break;
    }

    case "email.opened": {
      const isFirst = !delivery.firstOpenedAt;
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: {
          status: delivery.status === "CLICKED" ? "CLICKED" : "OPENED",
          firstOpenedAt: isFirst ? now : undefined,
          openCount: { increment: 1 },
        },
      });
      if (isFirst) await incCampaignCounter(delivery.campaignId, "openedCount");
      break;
    }

    case "email.clicked": {
      const isFirst = !delivery.firstClickedAt;
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "CLICKED",
          firstClickedAt: isFirst ? now : undefined,
          clickCount: { increment: 1 },
          // Si pas encore d'open trackée, on en pose une (un click implique un open)
          firstOpenedAt: delivery.firstOpenedAt ?? now,
        },
      });
      if (isFirst) await incCampaignCounter(delivery.campaignId, "clickedCount");
      break;
    }

    case "email.bounced": {
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: { status: "BOUNCED", bouncedAt: now },
      });
      await incCampaignCounter(delivery.campaignId, "bouncedCount");
      break;
    }

    case "email.complained": {
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: { status: "COMPLAINED", complainedAt: now },
      });
      await incCampaignCounter(delivery.campaignId, "complainedCount");

      // Bonus RGPD : on désabonne automatiquement les complaining (spam)
      // pour ne plus jamais leur envoyer.
      try {
        await prisma.newsletterSubscriber.update({
          where: { id: (await prisma.newsletterDelivery.findUnique({ where: { id: delivery.id }, select: { subscriberId: true } }))?.subscriberId ?? "" },
          data: { unsubscribedAt: now },
        });
      } catch {
        // Si la subscriber a été supprimée entre-temps, on ignore
      }
      break;
    }

    case "email.failed":
    case "email.delivery_delayed":
      // Pas besoin de marquer FAILED dur ici — c'est juste un soft fail.
      // Resend retentera. On log.
      console.log(
        `[resend webhook] ${event.type} pour delivery ${delivery.id}`,
      );
      break;

    case "email.sent":
      // On a déjà marqué SENT au moment de notre envoi, no-op.
      break;

    default:
      console.log(`[resend webhook] type inconnu ignoré : ${event.type}`);
  }
}

async function incCampaignCounter(
  campaignId: string,
  field:
    | "deliveredCount"
    | "openedCount"
    | "clickedCount"
    | "bouncedCount"
    | "complainedCount",
): Promise<void> {
  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { [field]: { increment: 1 } },
  });
}

/**
 * Vérification HMAC-SHA256 de la signature Svix (utilisée par Resend).
 *
 * Headers attendus :
 *  - svix-id : id de l'event
 *  - svix-timestamp : timestamp Unix
 *  - svix-signature : "v1,<base64-hmac>"
 *
 * Le secret commence par "whsec_" et la partie après est en base64.
 */
function verifySvixSignature(
  headers: Headers,
  body: string,
  secret: string,
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");

  if (!id || !timestamp || !signatureHeader) return false;

  // Tolérance horloge : refuse les requêtes plus vieilles que 5 min
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // Récupère le bytes du secret. Resend secret = "whsec_<base64>"
  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
    "base64",
  );

  const signedPayload = `${id}.${timestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes)
    .update(signedPayload)
    .digest("base64");

  // Le header contient "v1,SIG v2,SIG2 ..." — on parse toutes les signatures v1
  const candidates = signatureHeader
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));

  return candidates.some((candidate) => safeEqual(candidate, expected));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
