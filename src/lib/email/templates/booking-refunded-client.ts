/**
 * Email envoyé à la cliente lorsque l'admin annule + rembourse sa réservation
 * via Stripe (refund total). Indique le montant + délai de traitement.
 *
 * Cas d'usage :
 *  - Annulation par le salon (force majeure, indisponibilité) → refund 100%
 *  - Annulation cliente plus de 72h avant → refund 100% via lien tokenisé (#14)
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingRefundedClientInput = {
  clientFirstName: string;
  serviceTitle: string;
  date: Date;
  startTime: string;
  /** Raison transmise à la cliente */
  reason: string;
  /** Montant total remboursé (Stripe + carte cadeau re-créditée) */
  refundedCents: number;
  /** Portion remboursée sur la carte bancaire d'origine via Stripe. */
  stripeRefundedCents?: number;
  /** Portion re-créditée sur la carte cadeau. */
  giftCardRefundedCents?: number;
  /** Prefix (4 derniers chars) de la carte cadeau re-créditée. */
  giftCardPrefix?: string | null;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function buildBookingRefundedClientEmail(
  input: BookingRefundedClientInput,
) {
  const dateFr = formatDateFr(input.date);
  const refundFr = formatCents(input.refundedCents);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

  const subject = `Annulation et remboursement de votre RDV du ${dateFr}`;

  const stripePart = input.stripeRefundedCents ?? input.refundedCents;
  const gcPart = input.giftCardRefundedCents ?? 0;
  const gcPrefix = input.giftCardPrefix ?? null;
  const hasGcRefund = gcPart > 0;
  const hasStripeRefund = stripePart > 0;
  const isMixed = hasStripeRefund && hasGcRefund;

  // Texte explicatif adapté au mode de remboursement
  const refundDelayText = (() => {
    if (isMixed) {
      return `La portion carte bancaire (${formatCents(stripePart)}) apparaîtra sur votre relevé sous 3 à 5 jours ouvrés. La portion carte cadeau (${formatCents(gcPart)}) a été re-créditée immédiatement sur la carte ${gcPrefix ? `••${gcPrefix}` : ""}.`;
    }
    if (hasGcRefund) {
      return `Le montant a été re-crédité immédiatement sur votre carte cadeau${gcPrefix ? ` ••${gcPrefix}` : ""}, et reste utilisable selon sa date d'expiration.`;
    }
    return `Le remboursement apparaîtra sur votre carte bancaire sous 3 à 5 jours ouvrés.`;
  })();

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Votre rendez-vous a été annulé et l'acompte vous sera remboursé.`,
    ``,
    `→ ${input.serviceTitle}`,
    `→ ${dateFr} à ${input.startTime}`,
    ``,
    `Motif : ${input.reason}`,
    ``,
    `Montant total remboursé : ${refundFr}`,
    isMixed ? `  • ${formatCents(stripePart)} via carte bancaire` : "",
    isMixed
      ? `  • ${formatCents(gcPart)} re-crédité sur carte cadeau${gcPrefix ? ` ••${gcPrefix}` : ""}`
      : "",
    refundDelayText,
    ``,
    `Pour reprendre RDV : ${siteUrl}/#reservation`,
    `Une question ? {{contactEmail}} · {{contactPhone}}`,
    ``,
    `Clochette Nails`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour <strong>${escapeHtml(input.clientFirstName)}</strong>,
    </p>
    <p style="margin:0 0 24px 0;">
      Votre rendez-vous a été annulé. L'acompte que vous aviez réglé vous est intégralement remboursé.
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

    <div style="background-color:#f0f9f4;border-left:3px solid #2d8659;padding:16px;border-radius:4px;margin:0 0 24px 0;">
      <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
        Remboursement
      </p>
      <p style="margin:0 0 6px 0;font-size:20px;color:#1d6b48;font-weight:500;">
        ${escapeHtml(refundFr)}
      </p>
      ${
        isMixed
          ? `<p style="margin:0 0 8px 0;font-size:13px;color:${COLORS.ink700};">
              <span style="display:inline-block;width:8px;height:8px;background:${COLORS.violet600};border-radius:50%;margin-right:6px;"></span>
              ${escapeHtml(formatCents(stripePart))} via carte bancaire
              <br/>
              <span style="display:inline-block;width:8px;height:8px;background:#2d8659;border-radius:50%;margin-right:6px;"></span>
              ${escapeHtml(formatCents(gcPart))} re-crédité sur carte cadeau${gcPrefix ? ` ••${escapeHtml(gcPrefix)}` : ""}
            </p>`
          : ""
      }
      <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
        ${escapeHtml(refundDelayText)}
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

    <div style="text-align:center;margin:0 0 24px 0;">
      <a href="${siteUrl}/#reservation" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Reprendre rendez-vous
      </a>
    </div>

    <p style="margin:0;color:${COLORS.ink700};font-size:14px;">
      Une question sur ce remboursement ? Écrivez-nous à
      <a href="mailto:{{contactEmail}}" style="color:${COLORS.violet700};">{{contactEmail}}</a>
      ou appelez le
      <a href="{{contactPhoneHref}}" style="color:${COLORS.violet700};">{{contactPhone}}</a>.
    </p>
  `;

  const html = emailLayout({
    title: "Annulation et remboursement",
    subtitle: `${dateFr.charAt(0).toUpperCase() + dateFr.slice(1)} · ${input.startTime}`,
    contentHtml,
    preheader: `Annulation du RDV du ${dateFr} — remboursement de ${refundFr} en cours.`,
  });

  return { subject, html, text };
}
