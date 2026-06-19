/**
 * Email envoyé à la cliente après confirmation de sa réservation
 * (paiement Stripe réussi, gift card full coverage, ou dev fallback).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingConfirmationInput = {
  clientFirstName: string;
  clientEmail: string;
  serviceTitle: string;
  optionsTitles: string[];
  date: Date;
  startTime: string;
  endTime: string;
  totalDurationMinutes: number;
  depositCents: number;
  giftCardAmountCents: number;
  remainingAmountToPayInSalonCents?: number; // Solde à payer le jour du RDV
  /** Token cliente pour annulation/déplacement en ligne (single-use) */
  clientActionToken?: string;
  /**
   * Mode de paiement pour adapter le label "Réglé par X" :
   * "stripe" | "cash" | "transfer" | "check" | "card_terminal" | "gift_card_full" | "none"
   * Par défaut "stripe" pour rétro-compat.
   */
  paymentMethod?: string;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function paidLabel(method: string | undefined): string {
  switch (method) {
    case "cash":
      return "Réglé en espèces";
    case "transfer":
      return "Réglé par virement";
    case "check":
      return "Réglé par chèque";
    case "card_terminal":
      return "Réglé par carte (en salon)";
    case "stripe":
    default:
      return "Réglé par carte";
  }
}

export function buildBookingConfirmationEmail(input: BookingConfirmationInput) {
  const dateFr = formatDateFr(input.date);
  const depositPaid = input.depositCents - input.giftCardAmountCents;
  const paidRowLabel = paidLabel(input.paymentMethod);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
  const cancelUrl = input.clientActionToken
    ? `${siteUrl}/reservation/annuler?token=${input.clientActionToken}`
    : null;
  const rescheduleUrl = input.clientActionToken
    ? `${siteUrl}/reservation/deplacer?token=${input.clientActionToken}`
    : null;

  const subject = `Votre RDV est confirmé · ${dateFr} à ${input.startTime}`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Votre rendez-vous chez Clochette Nails est confirmé !`,
    ``,
    `→ ${input.serviceTitle}${input.optionsTitles.length > 0 ? ` (avec : ${input.optionsTitles.join(", ")})` : ""}`,
    `→ ${dateFr}`,
    `→ ${input.startTime} – ${input.endTime} (${formatDuration(input.totalDurationMinutes)})`,
    ``,
    `Acompte : ${formatCents(input.depositCents)}`,
    input.giftCardAmountCents > 0
      ? `Code cadeau utilisé : -${formatCents(input.giftCardAmountCents)}`
      : "",
    depositPaid > 0 ? `${paidRowLabel} : ${formatCents(depositPaid)}` : "",
    ``,
    `Adresse : Moncoutant-sur-Sèvre, 79320`,
    `Téléphone (en cas d'imprévu) : {{contactPhone}}`,
    ``,
    `Avant votre rendez-vous, vous recevrez deux rappels par email (7 jours avant, puis la veille). Pour être sûre de les recevoir, ajoutez {{contactEmail}} à vos contacts et pensez à vérifier vos courriers indésirables.`,
    ``,
    `Annulation gratuite jusqu'à 72h avant le RDV — au-delà l'acompte est conservé.`,
    cancelUrl ? `Annuler mon RDV : ${cancelUrl}` : "",
    rescheduleUrl ? `Déplacer mon RDV : ${rescheduleUrl}` : "",
    cancelUrl || rescheduleUrl
      ? `(Modification possible une seule fois en ligne)`
      : "",
    ``,
    `À très bientôt !`,
    `Clochette Nails`,
  ]
    .filter(Boolean)
    .join("\n");

  const optionsHtml =
    input.optionsTitles.length > 0
      ? `<li style="margin:8px 0;color:${COLORS.ink700};">
          <strong style="color:${COLORS.ink900};">Options :</strong>
          ${escapeHtml(input.optionsTitles.join(", "))}
        </li>`
      : "";

  const giftCardRow =
    input.giftCardAmountCents > 0
      ? `<tr>
          <td style="padding:6px 0;color:${COLORS.ink700};">Code cadeau</td>
          <td style="padding:6px 0;text-align:right;color:#2d8659;font-weight:500;">−${formatCents(input.giftCardAmountCents)}</td>
        </tr>`
      : "";

  const paidRow =
    depositPaid > 0
      ? `<tr>
          <td style="padding:6px 0;color:${COLORS.ink700};">${paidRowLabel}</td>
          <td style="padding:6px 0;text-align:right;color:${COLORS.ink900};font-weight:500;">${formatCents(depositPaid)}</td>
        </tr>`
      : "";

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour <strong>${escapeHtml(input.clientFirstName)}</strong>,
    </p>
    <p style="margin:0 0 24px 0;">
      Votre rendez-vous chez <strong>Clochette Nails</strong> est confirmé.
      Voici le récapitulatif :
    </p>

    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:20px;margin:0 0 24px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
        Votre rendez-vous
      </p>
      <p style="margin:0 0 16px 0;font-size:18px;color:${COLORS.ink900};font-weight:500;text-transform:capitalize;">
        ${escapeHtml(dateFr)}
      </p>
      <ul style="margin:0;padding:0;list-style:none;">
        <li style="margin:8px 0;color:${COLORS.ink700};">
          <strong style="color:${COLORS.ink900};">Prestation :</strong>
          ${escapeHtml(input.serviceTitle)}
        </li>
        ${optionsHtml}
        <li style="margin:8px 0;color:${COLORS.ink700};">
          <strong style="color:${COLORS.ink900};">Horaire :</strong>
          ${escapeHtml(input.startTime)} – ${escapeHtml(input.endTime)}
          <span style="color:${COLORS.ink500};">· ${formatDuration(input.totalDurationMinutes)}</span>
        </li>
      </ul>
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px 0;font-size:14px;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Paiement
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Acompte demandé</td>
        <td style="padding:6px 0;text-align:right;color:${COLORS.ink900};font-weight:500;">${formatCents(input.depositCents)}</td>
      </tr>
      ${giftCardRow}
      ${paidRow}
    </table>

    <p style="margin:0 0 12px 0;">
      <strong style="color:${COLORS.ink900};">Adresse :</strong> Moncoutant-sur-Sèvre, 79320
    </p>
    <p style="margin:0 0 24px 0;">
      <strong style="color:${COLORS.ink900};">Imprévu de dernière minute ?</strong>
      Appelez-nous au <a href="{{contactPhoneHref}}" style="color:${COLORS.violet700};">{{contactPhone}}</a>.
    </p>

    <p style="margin:0 0 24px 0;font-size:14px;color:${COLORS.ink700};">
      <strong style="color:${COLORS.ink900};">Avant votre rendez-vous,</strong>
      vous recevrez deux rappels par email (7 jours avant, puis la veille).
      Pour être sûre de les recevoir, ajoutez
      <a href="mailto:{{contactEmail}}" style="color:${COLORS.violet700};">{{contactEmail}}</a>
      à vos contacts et pensez à vérifier vos courriers indésirables.
    </p>

    <div style="background-color:${COLORS.violet50};border-left:3px solid ${COLORS.violet600};padding:12px 16px;border-radius:4px;margin:0 0 24px 0;">
      <p style="margin:0 0 ${cancelUrl || rescheduleUrl ? "12px" : "0"} 0;font-size:13px;color:${COLORS.ink700};">
        <strong style="color:${COLORS.violet700};">Annulation</strong> — Gratuite jusqu'à 72h avant le RDV.
        Au-delà, l'acompte est conservé à titre d'indemnité forfaitaire.
      </p>
      ${
        cancelUrl || rescheduleUrl
          ? `<p style="margin:0;font-size:13px;color:${COLORS.ink700};">
              ${
                rescheduleUrl
                  ? `<a href="${rescheduleUrl}" style="color:${COLORS.violet700};font-weight:500;text-decoration:none;border-bottom:1px solid ${COLORS.violet700};padding-bottom:1px;">Déplacer mon RDV</a>`
                  : ""
              }
              ${rescheduleUrl && cancelUrl ? `<span style="color:${COLORS.ink300};margin:0 8px;">·</span>` : ""}
              ${
                cancelUrl
                  ? `<a href="${cancelUrl}" style="color:#a52a4a;font-weight:500;text-decoration:none;border-bottom:1px solid #a52a4a;padding-bottom:1px;">Annuler mon RDV</a>`
                  : ""
              }
              <br>
              <span style="font-size:12px;color:${COLORS.ink500};">Modification ou annulation possible une seule fois en ligne.</span>
            </p>`
          : ""
      }
    </div>

    <p style="margin:0;color:${COLORS.ink700};">
      À très bientôt,<br>
      <em style="color:${COLORS.violet700};">Clochette Nails</em>
    </p>
  `;

  const html = emailLayout({
    title: "Rendez-vous confirmé",
    subtitle: `${dateFr.charAt(0).toUpperCase() + dateFr.slice(1)} à ${input.startTime}`,
    contentHtml,
    preheader: `Votre RDV ${input.serviceTitle} est confirmé pour le ${dateFr} à ${input.startTime}.`,
  });

  return { subject, html, text };
}
