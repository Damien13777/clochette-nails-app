"use server";

/**
 * Server Actions newsletter — flow Double Opt-In (CNIL).
 *
 *  subscribeNewsletter(email, source?)
 *    → email validé + rate-limit IP
 *    → 4 cas selon état existant :
 *        a) jamais inscrit    → create + envoi mail confirmation
 *        b) inscrit non confirmé → reset confirmToken + renvoi mail
 *        c) déjà confirmé actif  → return ok ("déjà inscrit")
 *        d) désabonné          → réactivation (nouveau cycle DOI complet)
 *
 *  confirmSubscription(token)
 *    → marque confirmedAt + envoie welcome + notif admin
 *
 *  unsubscribeNewsletter(token)
 *    → marque unsubscribedAt (soft delete)
 *
 * Anti-énumération : on retourne toujours { ok: true } sur subscribe (même pour
 * une adresse déjà inscrite), pour ne pas révéler l'existence d'une adresse.
 */

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildNewsletterConfirmEmail } from "@/lib/email/templates/newsletter-confirm";
import { buildNewsletterWelcomeEmail } from "@/lib/email/templates/newsletter-welcome";
import { getClientIp } from "@/lib/client-ip";
import {
  NEWSLETTER,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";

const emailSchema = z.string().trim().toLowerCase().email().max(150);
const sourceSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_-]+$/i)
  .optional();

type SubscribeResult =
  | { ok: true; alreadyConfirmed?: boolean }
  | { ok: false; error: string; code?: string };

type ConfirmResult =
  | { ok: true; email: string; alreadyConfirmed: boolean }
  | { ok: false; error: string; code?: string };

type UnsubscribeResult =
  | { ok: true; email: string }
  | { ok: false; error: string; code?: string };

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// ─────────────────────────────────────────────────────────
// 1. SUBSCRIBE — étape 1 du DOI
// ─────────────────────────────────────────────────────────

export async function subscribeNewsletter(
  rawEmail: string,
  rawSource?: string,
  honeypot?: string,
): Promise<SubscribeResult> {
  const h = await headers();
  const ip = getClientIp(h);

  // Honeypot : si rempli, c'est un bot. On simule un succès silencieux avec
  // un petit délai aléatoire pour ne pas révéler la détection.
  if (honeypot && honeypot.length > 0) {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    return { ok: true };
  }

  const rl = checkRateLimit(NEWSLETTER.bucket, ip, NEWSLETTER.max, NEWSLETTER.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop d'inscriptions depuis cette adresse. Réessayez plus tard.",
      code: "RATE_LIMITED",
    };
  }

  const parsedEmail = emailSchema.safeParse(rawEmail);
  if (!parsedEmail.success) {
    return { ok: false, error: "Adresse email invalide.", code: "INVALID_EMAIL" };
  }
  const email = parsedEmail.data;

  const parsedSource = sourceSchema.safeParse(rawSource);
  const source = parsedSource.success ? parsedSource.data ?? "footer" : "footer";

  // Une seule tentative consomme un cran de rate-limit
  recordRateLimit(NEWSLETTER.bucket, ip, NEWSLETTER.windowMs);

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email },
    select: {
      id: true,
      confirmedAt: true,
      unsubscribedAt: true,
    },
  });

  // Cas (c) : déjà inscrit et confirmé
  if (existing && existing.confirmedAt && !existing.unsubscribedAt) {
    return { ok: true, alreadyConfirmed: true };
  }

  const confirmToken = newToken();
  const confirmUrl = `${siteUrl()}/newsletter/confirmer?token=${confirmToken}`;

  if (!existing) {
    // Cas (a) : jamais inscrit
    await prisma.newsletterSubscriber.create({
      data: {
        email,
        source,
        consentIp: ip,
        confirmToken,
        unsubscribeToken: newToken(),
      },
    });
  } else {
    // Cas (b) ou (d) : re-active avec nouveau token (efface ancien désabo si présent)
    await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: {
        source,
        consentGivenAt: new Date(),
        consentIp: ip,
        confirmToken,
        confirmedAt: null,
        unsubscribedAt: null,
        // unsubscribeToken : on régénère pour invalider d'éventuels anciens liens
        unsubscribeToken: newToken(),
      },
    });
  }

  // Envoi mail confirmation (fire-and-log)
  try {
    const mail = buildNewsletterConfirmEmail({ confirmUrl });
    await sendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "newsletter.confirm",
    });
  } catch (err) {
    console.error("[subscribeNewsletter] email confirm échoué:", err);
    // Pas de fail côté UI : on ne révèle pas l'échec d'envoi (anti-énumération)
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// 2. CONFIRM — étape 2 du DOI
// ─────────────────────────────────────────────────────────

export async function confirmSubscription(
  token: string,
): Promise<ConfirmResult> {
  if (!token || token.length < 32) {
    return { ok: false, error: "Lien de confirmation invalide.", code: "INVALID_TOKEN" };
  }

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { confirmToken: token },
    select: {
      id: true,
      email: true,
      confirmedAt: true,
      unsubscribedAt: true,
      unsubscribeToken: true,
    },
  });

  if (!subscriber) {
    return {
      ok: false,
      error: "Lien invalide ou expiré. Inscrivez-vous à nouveau depuis le site.",
      code: "INVALID_TOKEN",
    };
  }

  // Idempotent : si déjà confirmé, on retourne success (deuxième clic sur le lien)
  if (subscriber.confirmedAt) {
    return {
      ok: true,
      email: subscriber.email,
      alreadyConfirmed: true,
    };
  }

  // Réactivation possible si elle s'était désabonnée puis ré-inscrite
  const now = new Date();
  await prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: {
      confirmedAt: now,
      unsubscribedAt: null,
      // confirmToken invalidé après usage (single-use)
      confirmToken: null,
    },
  });

  const unsubscribeUrl = `${siteUrl()}/newsletter/desinscrire?token=${subscriber.unsubscribeToken}`;

  // Notification in-app admin
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "NEWSLETTER_SUBSCRIBE",
          title: "Nouvelle inscription newsletter",
          body: subscriber.email,
          link: `/admin/newsletter`,
        },
      });
    }
  } catch (err) {
    console.error("[confirmSubscription] notif admin échouée:", err);
  }

  // Email welcome
  try {
    const mail = buildNewsletterWelcomeEmail({ unsubscribeUrl });
    await sendEmail({
      to: subscriber.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "newsletter.welcome",
    });
  } catch (err) {
    console.error("[confirmSubscription] email welcome échoué:", err);
  }

  return { ok: true, email: subscriber.email, alreadyConfirmed: false };
}

// ─────────────────────────────────────────────────────────
// 3. UNSUBSCRIBE
// ─────────────────────────────────────────────────────────

export async function unsubscribeNewsletter(
  token: string,
): Promise<UnsubscribeResult> {
  if (!token || token.length < 32) {
    return { ok: false, error: "Lien invalide.", code: "INVALID_TOKEN" };
  }

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, email: true, unsubscribedAt: true },
  });

  if (!subscriber) {
    return { ok: false, error: "Lien invalide.", code: "INVALID_TOKEN" };
  }

  // Idempotent : si déjà désabonnée, success
  if (!subscriber.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  return { ok: true, email: subscriber.email };
}
