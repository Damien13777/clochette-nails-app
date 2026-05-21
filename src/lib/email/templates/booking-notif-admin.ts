/**
 * Email envoyé à l'admin (Chloé) quand une nouvelle réservation est confirmée.
 * Complémente la Notification in-app (cloche) pour les cas où Chloé ne se
 * connecte pas régulièrement.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingNotifAdminInput = {
  bookingId: string;
  serviceTitle: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  clientMessage?: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  depositCents: number;
  giftCardAmountCents: number;
  paidVia: string; // "stripe" | "stripe_with_gift_card" | "gift_card_full" | "dev_fallback"
  /** Photos jointes par la cliente (URLs absolues siteUrl + /uploads/…). */
  photoUrls?: string[];
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

function labelPaidVia(via: string): string {
  switch (via) {
    case "stripe":
      return "Carte bancaire (Stripe)";
    case "stripe_with_gift_card":
      return "Carte bancaire + code cadeau";
    case "gift_card_full":
      return "Code cadeau (intégral)";
    case "dev_fallback":
      return "Mode dev (sans paiement)";
    // RDV admin avec paiement physique
    case "paid_in_person_cash":
      return "Espèces (en main propre)";
    case "paid_in_person_transfer":
      return "Virement bancaire";
    case "paid_in_person_check":
      return "Chèque";
    case "paid_in_person_card_terminal":
      return "TPE / Carte bancaire (en salon)";
    // RDV admin sans acompte
    case "admin_no_deposit":
      return "Aucun acompte (RDV admin)";
    default:
      return via;
  }
}

export function buildBookingNotifAdminEmail(input: BookingNotifAdminInput) {
  const dateFr = formatDateFr(input.date);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const bookingUrl = `${siteUrl}/admin/bookings/${input.bookingId}`;

  const subject = `🗓️ Nouveau RDV · ${input.clientFirstName} ${input.clientLastName} · ${dateFr}`;

  const text = [
    `Nouvelle réservation confirmée !`,
    ``,
    `Cliente : ${input.clientFirstName} ${input.clientLastName}`,
    `Email   : ${input.clientEmail}`,
    `Tél     : ${input.clientPhone}`,
    ``,
    `Prestation : ${input.serviceTitle}`,
    `Date       : ${dateFr}`,
    `Horaire    : ${input.startTime} – ${input.endTime}`,
    ``,
    `Acompte    : ${formatCents(input.depositCents)}`,
    input.giftCardAmountCents > 0
      ? `Code cadeau : -${formatCents(input.giftCardAmountCents)}`
      : "",
    input.paidVia === "stripe_with_gift_card"
      ? `Réglé par carte : ${formatCents(input.depositCents - input.giftCardAmountCents)}`
      : "",
    `Payé via   : ${labelPaidVia(input.paidVia)}`,
    ``,
    input.clientMessage ? `Message client :\n${input.clientMessage}\n` : "",
    `Voir la réservation : ${bookingUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const messageHtml = input.clientMessage
    ? `<div style="background-color:${COLORS.cream};border-left:3px solid ${COLORS.violet600};padding:12px 16px;border-radius:4px;margin:0 0 20px 0;">
        <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
          Message de la cliente
        </p>
        <p style="margin:0;font-style:italic;color:${COLORS.ink700};white-space:pre-wrap;">
          ${escapeHtml(input.clientMessage)}
        </p>
      </div>`
    : "";

  const photosHtml =
    input.photoUrls && input.photoUrls.length > 0
      ? `<div style="margin:0 0 20px 0;">
          <p style="margin:0 0 10px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
            Photos jointes (${input.photoUrls.length})
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:6px;">
            <tr>
              ${input.photoUrls
                .map(
                  (url) => `
                <td style="width:90px;vertical-align:top;">
                  <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:block;">
                    <img src="${escapeHtml(url)}" alt="Photo jointe" width="90" height="90" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid ${COLORS.line};display:block;" />
                  </a>
                </td>`,
                )
                .join("")}
            </tr>
          </table>
        </div>`
      : "";

  const giftCardRow =
    input.giftCardAmountCents > 0
      ? `<tr>
          <td style="padding:6px 0;color:${COLORS.ink700};">Code cadeau</td>
          <td style="padding:6px 0;text-align:right;color:#2d8659;font-weight:500;">−${formatCents(input.giftCardAmountCents)}</td>
        </tr>`
      : "";

  const stripePortionRow =
    input.paidVia === "stripe_with_gift_card"
      ? `<tr>
          <td style="padding:6px 0;color:${COLORS.ink700};">Réglé par carte</td>
          <td style="padding:6px 0;color:${COLORS.ink900};">${formatCents(input.depositCents - input.giftCardAmountCents)}</td>
        </tr>`
      : "";

  const contentHtml = `
    <p style="margin:0 0 20px 0;font-size:16px;color:${COLORS.ink900};">
      Une nouvelle réservation vient d'être confirmée 🎉
    </p>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Cliente
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Nom</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.clientFirstName)} ${escapeHtml(input.clientLastName)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Email</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="mailto:${escapeHtml(input.clientEmail)}" style="color:${COLORS.violet700};">${escapeHtml(input.clientEmail)}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Téléphone</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="tel:${escapeHtml(input.clientPhone.replace(/[^+0-9]/g, ""))}" style="color:${COLORS.violet700};">${escapeHtml(input.clientPhone)}</a></td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-top:1px solid ${COLORS.line};padding-top:16px;">
      <tr>
        <td colspan="2" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Prestation
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Service</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.serviceTitle)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Date</td>
        <td style="padding:6px 0;color:${COLORS.ink900};text-transform:capitalize;">${escapeHtml(dateFr)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Horaire</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.startTime)} – ${escapeHtml(input.endTime)}</td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-top:1px solid ${COLORS.line};padding-top:16px;">
      <tr>
        <td colspan="2" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Paiement
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Acompte</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${formatCents(input.depositCents)}</td>
      </tr>
      ${giftCardRow}
      ${stripePortionRow}
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Moyen</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(labelPaidVia(input.paidVia))}</td>
      </tr>
    </table>

    ${messageHtml}
    ${photosHtml}

    <div style="margin:24px 0 0 0;text-align:center;">
      <a href="${bookingUrl}" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Voir la réservation dans l'admin
      </a>
    </div>
  `;

  const html = emailLayout({
    title: "Nouveau rendez-vous",
    subtitle: `${input.clientFirstName} ${input.clientLastName} · ${dateFr}`,
    contentHtml,
    preheader: `${input.clientFirstName} a réservé ${input.serviceTitle} le ${dateFr} à ${input.startTime}.`,
  });

  return { subject, html, text };
}
