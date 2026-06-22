"use server";

/**
 * Server Actions — Gestion des campagnes newsletter.
 *
 * Actions principales :
 *  - createCampaign(formData) / updateCampaign(id, formData)
 *  - deleteCampaign(id) : autorisé uniquement si DRAFT
 *  - sendTestCampaign(id) : envoie 1 mail à l'admin loggué (preview)
 *  - sendCampaignNow(id) : déclenche l'envoi immédiat (boucle delivery)
 *  - scheduleCampaign(id, scheduledAt) : passe en SCHEDULED, cron prendra le relais
 *  - cancelSchedule(id) : repasse SCHEDULED → DRAFT
 *
 * Helpers internes :
 *  - executeCampaignSend(campaignId, adminId|null) : la vraie boucle d'envoi
 *    (utilisée par sendCampaignNow et par le cron pour les campagnes
 *    programmées). Idempotent : si un envoi a déjà commencé, on ne le rejoue
 *    pas (status != DRAFT/SCHEDULED → no-op).
 *
 * Audit log sur les actions critiques (send, schedule).
 */

import { revalidatePath } from "next/cache";
import type {
  NewsletterCampaignStatus,
  NewsletterDeliveryStatus,
  Prisma,
} from "@prisma/client";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { sendEmail } from "@/lib/email/send";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { buildNewsletterCampaignEmail } from "@/lib/email/templates/newsletter-campaign";
import {
  type AudienceFilters,
  loadAudience,
  sanitizeAudienceFilters,
} from "@/lib/newsletter-audience";

type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function audit(
  adminId: string,
  campaignId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      metadata: { campaignId, ...(metadata ?? {}) } as object,
    },
  });
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr"
  );
}

// ─── Parse form ─────────────────────────────────────────────

type ParsedFields = {
  subject: string;
  preheader: string | null;
  content: string;
  audienceFilters: AudienceFilters;
};

function parseFormData(
  formData: FormData,
):
  | { ok: true; data: ParsedFields }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject || subject.length < 3)
    fieldErrors.subject = "Sujet requis (3 chars min).";
  if (subject.length > 200) fieldErrors.subject = "Sujet trop long (200 max).";

  const preheaderRaw = String(formData.get("preheader") ?? "").trim();
  const preheader = preheaderRaw.length > 0 ? preheaderRaw.slice(0, 200) : null;

  const content = String(formData.get("content") ?? "").trim();
  if (!content || content.length < 30)
    fieldErrors.content = "Contenu requis (30 chars min).";
  if (content.length > 100_000)
    fieldErrors.content = "Contenu trop long (100 000 max).";

  // Audience filters (JSON sérialisé côté form)
  let audienceFilters: AudienceFilters = {};
  const filtersRaw = String(formData.get("audienceFilters") ?? "");
  if (filtersRaw.length > 0) {
    try {
      const parsed = JSON.parse(filtersRaw);
      audienceFilters = sanitizeAudienceFilters(parsed);
    } catch {
      fieldErrors.audienceFilters = "Filtres d'audience invalides.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: { subject, preheader, content, audienceFilters },
  };
}

// ─── CRUD ───────────────────────────────────────────────────

export async function createCampaign(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok)
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };

  const created = await prisma.newsletterCampaign.create({
    data: {
      subject: parsed.data.subject,
      preheader: parsed.data.preheader,
      content: parsed.data.content,
      audienceFilters: parsed.data.audienceFilters as Prisma.InputJsonValue,
      status: "DRAFT",
    },
    select: { id: true },
  });

  revalidatePath("/admin/newsletter/campagnes");
  return { ok: true, id: created.id };
}

export async function updateCampaign(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    return {
      ok: false,
      error: "Seules les campagnes en brouillon ou programmées peuvent être modifiées.",
    };
  }

  const parsed = parseFormData(formData);
  if (!parsed.ok)
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };

  await prisma.newsletterCampaign.update({
    where: { id },
    data: {
      subject: parsed.data.subject,
      preheader: parsed.data.preheader,
      content: parsed.data.content,
      audienceFilters: parsed.data.audienceFilters as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/admin/newsletter/campagnes");
  revalidatePath(`/admin/newsletter/campagnes/${id}`);
  return { ok: true, id };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  if (campaign.status !== "DRAFT" && campaign.status !== "CANCELLED") {
    return {
      ok: false,
      error: "Seules les campagnes en brouillon (ou annulées) peuvent être supprimées.",
    };
  }

  await prisma.newsletterCampaign.delete({ where: { id } });
  await audit(admin.id, id, "newsletter.campaign_deleted");

  revalidatePath("/admin/newsletter/campagnes");
  return { ok: true };
}

// ─── Send Test ──────────────────────────────────────────────

export async function sendTestCampaign(
  campaignId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };
  if (!admin.email) {
    return {
      ok: false,
      error: "Ton compte admin n'a pas d'email associé.",
    };
  }

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id: campaignId },
    select: {
      subject: true,
      preheader: true,
      content: true,
    },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };

  const mail = buildNewsletterCampaignEmail({
    subject: `[TEST] ${campaign.subject}`,
    preheader: campaign.preheader,
    contentHtml: sanitizeHtml(campaign.content),
    // Token bidon pour le test (l'admin ne s'auto-désabonnera pas)
    unsubscribeUrl: `${siteOrigin()}/newsletter/desinscrire?token=test-preview`,
    siteUrl: siteOrigin(),
  });

  const result = await sendEmail({
    to: admin.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: "newsletter.test",
  });

  if (!result.ok) return { ok: false, error: `Envoi test échoué : ${result.error}` };

  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: {
      lastTestSentTo: admin.email,
      lastTestSentAt: new Date(),
    },
  });

  await audit(admin.id, campaignId, "newsletter.test_sent", { to: admin.email });
  revalidatePath(`/admin/newsletter/campagnes/${campaignId}`);
  return { ok: true, message: `Test envoyé à ${admin.email}.` };
}

// ─── Programmation ──────────────────────────────────────────

export async function scheduleCampaign(
  campaignId: string,
  scheduledAtIso: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const d = new Date(scheduledAtIso);
  if (Number.isNaN(d.getTime()))
    return { ok: false, error: "Date invalide." };
  if (d.getTime() <= Date.now()) {
    return {
      ok: false,
      error: "La date de programmation doit être dans le futur.",
    };
  }

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    return {
      ok: false,
      error: "Seules les campagnes en brouillon ou programmées peuvent être (re)programmées.",
    };
  }

  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: "SCHEDULED", scheduledAt: d },
  });
  await audit(admin.id, campaignId, "newsletter.scheduled", {
    scheduledAt: d.toISOString(),
  });

  revalidatePath("/admin/newsletter/campagnes");
  revalidatePath(`/admin/newsletter/campagnes/${campaignId}`);
  return { ok: true, message: `Programmée pour le ${d.toLocaleString("fr-FR")}.` };
}

export async function cancelSchedule(
  campaignId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  if (campaign.status !== "SCHEDULED") {
    return { ok: false, error: "Cette campagne n'est pas programmée." };
  }

  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: "DRAFT", scheduledAt: null },
  });
  await audit(admin.id, campaignId, "newsletter.schedule_cancelled");

  revalidatePath("/admin/newsletter/campagnes");
  revalidatePath(`/admin/newsletter/campagnes/${campaignId}`);
  return { ok: true, message: "Programmation annulée, retour en brouillon." };
}

// ─── Send Now (wrapper) ────────────────────────────────────

export async function sendCampaignNow(
  campaignId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const result = await executeCampaignSend(campaignId, admin.id);
  revalidatePath("/admin/newsletter/campagnes");
  revalidatePath(`/admin/newsletter/campagnes/${campaignId}`);
  return result;
}

// ─── Cœur du moteur d'envoi (réutilisé par cron) ───────────

/**
 * Exécute l'envoi effectif d'une campagne. Appelée par sendCampaignNow
 * (admin déclenche) ou par le cron de campagnes programmées.
 *
 * Idempotence : si la campagne n'est plus en DRAFT/SCHEDULED, on no-op.
 * Le passage en SENDING est atomique (updateMany avec condition de statut).
 */
export async function executeCampaignSend(
  campaignId: string,
  adminId: string | null,
): Promise<ActionResult> {
  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      subject: true,
      preheader: true,
      content: true,
      status: true,
      audienceFilters: true,
    },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };

  // Vérif feature flag
  const settings = await prisma.platformSettings.findFirst({
    select: { newsletterEnabled: true },
  });
  if (!settings?.newsletterEnabled) {
    return { ok: false, error: "Newsletter désactivée dans les paramètres." };
  }

  // Lock atomique : passe DRAFT|SCHEDULED → SENDING. Si quelqu'un d'autre l'a
  // déjà fait, on no-op.
  const lock = await prisma.newsletterCampaign.updateMany({
    where: {
      id: campaignId,
      status: { in: ["DRAFT", "SCHEDULED"] },
    },
    data: { status: "SENDING" },
  });
  if (lock.count === 0) {
    return {
      ok: false,
      error: "Cette campagne ne peut plus être envoyée (déjà envoyée ou en cours).",
    };
  }

  // Charge l'audience selon les filtres
  const filters = (campaign.audienceFilters ?? null) as AudienceFilters | null;
  const audience = await loadAudience(filters);

  if (audience.length === 0) {
    await prisma.newsletterCampaign.update({
      where: { id: campaignId },
      data: {
        status: "FAILED",
        recipientCount: 0,
      },
    });
    if (adminId)
      await audit(adminId, campaignId, "newsletter.send_failed", {
        reason: "audience vide",
      });
    await emitOutboundEvent("newsletter.campaign_failed", {
      campaignId,
      recipientCount: 0,
      reason: "audience vide",
    });
    return { ok: false, error: "Audience vide : aucune abonnée ne correspond aux filtres." };
  }

  // Init compteur audience
  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { recipientCount: audience.length },
  });

  // Crée les rows Delivery PENDING en une fois (upsert pour idempotence)
  // pour pouvoir tracker chaque envoi individuellement.
  await prisma.newsletterDelivery.createMany({
    data: audience.map((s) => ({
      campaignId,
      subscriberId: s.id,
      email: s.email,
      status: "PENDING" as NewsletterDeliveryStatus,
    })),
    skipDuplicates: true,
  });

  // Sanitize content une seule fois
  const safeContent = sanitizeHtml(campaign.content);
  const origin = siteOrigin();

  let sentCount = 0;
  let failedCount = 0;

  // Boucle d'envoi — séquentielle, avec petit délai pour rester sous le
  // rate-limit Resend (2 req/s en free, 10 req/s en pro).
  // 250ms entre chaque = 4 envois/sec, safe.
  for (const sub of audience) {
    const unsubscribeUrl = `${origin}/newsletter/desinscrire?token=${sub.unsubscribeToken}`;
    const mail = buildNewsletterCampaignEmail({
      subject: campaign.subject,
      preheader: campaign.preheader,
      contentHtml: safeContent,
      unsubscribeUrl,
      siteUrl: origin,
    });

    try {
      const r = await sendEmail({
        to: sub.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: `newsletter.campaign.${campaignId}`,
      });

      if (r.ok) {
        sentCount++;
        await prisma.newsletterDelivery.updateMany({
          where: { campaignId, subscriberId: sub.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            resendMessageId: r.id ?? null,
          },
        });
      } else {
        failedCount++;
        await prisma.newsletterDelivery.updateMany({
          where: { campaignId, subscriberId: sub.id },
          data: {
            status: "FAILED",
            errorMessage: r.error.slice(0, 500),
          },
        });
      }
    } catch (err) {
      failedCount++;
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      await prisma.newsletterDelivery.updateMany({
        where: { campaignId, subscriberId: sub.id },
        data: {
          status: "FAILED",
          errorMessage: msg.slice(0, 500),
        },
      });
    }

    // Throttle : 250ms entre envois (= 4 mails/sec)
    await sleep(250);
  }

  // Update compteurs finaux
  const finalStatus: NewsletterCampaignStatus =
    sentCount === 0 ? "FAILED" : "SENT";

  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: {
      status: finalStatus,
      sentAt: new Date(),
      sentCount,
      failedCount,
    },
  });
  await emitOutboundEvent(
    finalStatus === "SENT"
      ? "newsletter.campaign_sent"
      : "newsletter.campaign_failed",
    {
      campaignId,
      recipientCount: audience.length,
      sentCount,
      failedCount,
    },
  );

  if (adminId) {
    await audit(adminId, campaignId, "newsletter.sent", {
      audience: audience.length,
      sentCount,
      failedCount,
    });
  }

  // Notif admin in-app
  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUser) {
      await prisma.notification.create({
        data: {
          userId: adminUser.id,
          type: "NEWSLETTER_SENT",
          title: `Campagne envoyée : ${campaign.subject}`,
          body: `${sentCount}/${audience.length} envoyés, ${failedCount} échecs.`,
          link: `/admin/newsletter/campagnes/${campaignId}`,
          metadata: { campaignId } as object,
        },
      });
    }
  } catch (err) {
    console.error("[newsletter] notif admin échec:", err);
  }

  return {
    ok: true,
    message: `Envoi terminé : ${sentCount} OK, ${failedCount} échec(s).`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
