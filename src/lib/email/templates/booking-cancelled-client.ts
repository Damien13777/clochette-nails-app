/**
 * Email envoyé à la cliente lorsque l'admin annule sa réservation
 * SANS remboursement (le refund est dans un template séparé).
 *
 * Cas d'usage typique : annulation par le salon pour raison opérationnelle,
 * ou annulation après le délai 72h (acompte conservé selon CGV).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingCancelledClientInput = {
  clientFirstName: string;
  serviceTitle: string;
  date: Date;
  startTime: string;
  /** Raison transmise à la cliente (peut différer de la raison interne) */
  reason: string;
  /** Si true → précise que l'acompte est conservé selon CGV */
  depositKept: boolean;
  /**
   * Contexte précis du sort de l'acompte (utilisé pour adapter le texte) :
   *  - "too-late" : annulation < 72h, acompte forfaitaire conservé
   *  - "paid-in-person" : paiement physique, non remboursable automatiquement
   *  - "no-deposit" : pas d'acompte versé, annulation libre
   *  - "refunded" : remboursé via Stripe (cas depositKept=false)
   *  - non fourni → fallback générique
   */
  depositReason?: "too-late" | "paid-in-person" | "no-deposit" | "refunded";
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildBookingCancelledClientEmail(
  input: BookingCancelledClientInput,
) {
  const dateFr = formatDateFr(input.date);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

  const subject = `Votre RDV du ${dateFr} a été annulé`;

  // Texte sur le sort de l'acompte, adapté au contexte de l'annulation.
  function buildDepositLine(): string {
    if (!input.depositKept) {
      return `Si un acompte avait été versé, son remboursement vous sera communiqué séparément.`;
    }
    switch (input.depositReason) {
      case "paid-in-person":
        return `L'acompte ayant été réglé directement au salon, il est conservé à titre d'indemnité forfaitaire conformément aux CGV §11. Le remboursement automatique en ligne n'est pas possible dans ce cas — pour toute demande spécifique, contactez-nous directement.`;
      case "no-deposit":
        return `Aucun acompte n'avait été versé pour ce rendez-vous : aucune retenue n'est appliquée.`;
      case "too-late":
        return `L'acompte est conservé conformément aux CGV §11 (annulation moins de 72h avant le rendez-vous).`;
      default:
        return `L'acompte est conservé conformément à nos conditions générales.`;
    }
  }
  const depositLine = buildDepositLine();

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Votre rendez-vous a été annulé.`,
    ``,
    `→ ${input.serviceTitle}`,
    `→ ${dateFr} à ${input.startTime}`,
    ``,
    `Motif : ${input.reason}`,
    ``,
    depositLine,
    ``,
    `Pour reprendre RDV : ${siteUrl}/#reservation`,
    `Une question ? {{contactEmail}} · {{contactPhone}}`,
    ``,
    `Clochette Nails`,
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour <strong>${escapeHtml(input.clientFirstName)}</strong>,
    </p>
    <p style="margin:0 0 24px 0;">
      Nous vous informons que votre rendez-vous a été annulé.
    </p>

    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:20px;margin:0 0 24px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
        Rendez-vous annulé
      </p>
      <p style="margin:0 0 12px 0;font-size:17px;color:${COLORS.ink900};font-weight:500;text-transform:capitalize;text-decoration:line-through;text-decoration-color:${COLORS.ink300};">
        ${escapeHtml(dateFr)} à ${escapeHtml(input.startTime)}
      </p>
      <p style="margin:0;font-size:14px;color:${COLORS.ink700};">
        ${escapeHtml(input.serviceTitle)}
      </p>
    </div>

    <div style="background-color:#fff5f0;border-left:3px solid #c87850;padding:12px 16px;border-radius:4px;margin:0 0 24px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
        Motif de l'annulation
      </p>
      <p style="margin:0;font-size:14px;color:${COLORS.ink700};white-space:pre-wrap;">
        ${escapeHtml(input.reason)}
      </p>
    </div>

    <p style="margin:0 0 24px 0;font-size:14px;color:${COLORS.ink700};">
      ${escapeHtml(depositLine)}
    </p>

    <div style="text-align:center;margin:0 0 24px 0;">
      <a href="${siteUrl}/#reservation" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Reprendre rendez-vous
      </a>
    </div>

    <p style="margin:0;color:${COLORS.ink700};font-size:14px;">
      Une question, un imprévu ? Écrivez-nous à
      <a href="mailto:{{contactEmail}}" style="color:${COLORS.violet700};">{{contactEmail}}</a>
      ou appelez le
      <a href="{{contactPhoneHref}}" style="color:${COLORS.violet700};">{{contactPhone}}</a>.
    </p>
  `;

  const html = emailLayout({
    title: "Rendez-vous annulé",
    subtitle: `${dateFr.charAt(0).toUpperCase() + dateFr.slice(1)} · ${input.startTime}`,
    contentHtml,
    preheader: `Votre RDV du ${dateFr} à ${input.startTime} a été annulé.`,
  });

  return { subject, html, text };
}
