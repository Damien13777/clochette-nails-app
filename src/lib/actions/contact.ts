"use server";

/**
 * Server Action — form de contact général (pas RDV).
 *
 * Phase 1 minimal : Zod validation + insertion ContactMessage + log.
 * Phase 2 : ajout reCAPTCHA + Resend email admin + OutboundEvent vers Management.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CONTACT,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import { headers } from "next/headers";
import { sendEmail } from "@/lib/email/send";
import { ADMIN_EMAIL } from "@/lib/email/client";
import { buildContactNotifAdminEmail } from "@/lib/email/templates/contact-notif-admin";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { getClientIp } from "@/lib/client-ip";
import { emitOutboundEvent } from "@/lib/outbound-events";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(100),
  email: z.string().email("Email invalide").max(150),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().min(10, "Message trop court (10 char min)").max(2000),
  website: z.string().max(0).optional(), // honeypot
  recaptchaToken: z.string().optional(), // reCAPTCHA v3 (vérifié côté serveur)
});

export type ContactState = {
  ok: boolean;
  error?: string;
  code?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof contactSchema>, string>>;
  /** Valeurs renvoyées pour repopuler le form après échec (React 19
   * auto-reset les inputs uncontrolled à chaque submit). */
  values?: {
    name?: string;
    email?: string;
    phone?: string;
    subject?: string;
    message?: string;
  };
};

export async function submitContactAction(
  _prev: ContactState | null,
  formData: FormData,
): Promise<ContactState> {
  // Rate limit par IP
  const h = await headers();
  const ip = getClientIp(h);

  // Validation
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    website: formData.get("website"),
    recaptchaToken: formData.get("recaptchaToken") ?? undefined,
  };
  // Valeurs ré-injectables côté form si échec (React 19 reset les inputs)
  const submittedValues: ContactState["values"] = {
    name: typeof raw.name === "string" ? raw.name : "",
    email: typeof raw.email === "string" ? raw.email : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    subject: typeof raw.subject === "string" ? raw.subject : "",
    message: typeof raw.message === "string" ? raw.message : "",
  };

  const rl = checkRateLimit(CONTACT.bucket, ip, CONTACT.max, CONTACT.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
      code: "RATE_LIMITED",
      values: submittedValues,
    };
  }

  const parsed = contactSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: ContactState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0] as keyof z.infer<typeof contactSchema>;
      fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: "Veuillez vérifier les champs marqués.",
      code: "VALIDATION_ERROR",
      fieldErrors,
      values: submittedValues,
    };
  }

  const data = parsed.data;

  // Honeypot : rejet silencieux 200 OK avec délai aléatoire
  if (data.website && data.website.length > 0) {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    return { ok: true }; // fake success
  }

  // reCAPTCHA v3 (skip si pas de clé serveur → dev ; fail-open si Google down)
  const captcha = await verifyRecaptcha(data.recaptchaToken, "contact", ip);
  if (!captcha.ok) {
    return {
      ok: false,
      error: "La vérification de sécurité a échoué. Merci de réessayer.",
      code: "RECAPTCHA_FAILED",
      values: submittedValues,
    };
  }

  recordRateLimit(CONTACT.bucket, ip, CONTACT.windowMs);

  // Insertion DB
  const created = await prisma.contactMessage.create({
    data: {
      name: data.name,
      email: data.email.trim().toLowerCase(),
      phone: data.phone || null,
      subject: data.subject || null,
      message: data.message,
      ipAddress: ip,
      userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
    },
    select: { id: true },
  });
  await emitOutboundEvent("contact.received", {
    contactId: created.id,
    email: data.email.trim().toLowerCase(),
    subject: data.subject || null,
  });

  // Notification admin par email (replyTo = email cliente pour répondre direct)
  try {
    const adminMail = buildContactNotifAdminEmail({
      contactMessageId: created.id,
      name: data.name,
      email: data.email.trim().toLowerCase(),
      phone: data.phone || null,
      subject: data.subject || null,
      message: data.message,
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: data.email.trim().toLowerCase(),
      tag: "contact.notif-admin",
    });
  } catch (err) {
    console.error("[contact] email admin échoué:", err);
    // On ne fail pas la submission — message déjà persisté en DB
  }

  return { ok: true };
}
