/**
 * Email envoyé à la bénéficiaire quand l'admin (Chloé) émet manuellement
 * une carte cadeau depuis l'admin (geste commercial, cadeau famille, etc.).
 *
 * Le code en clair apparaît UNE SEULE FOIS dans cet email (et brièvement
 * dans l'admin après création) — il n'est pas stocké en clair ailleurs.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type GiftCardAdminIssuedInput = {
  recipientFirstName: string;
  code: string;
  initialAmountCents: number;
  expiresAt: Date;
  message?: string | null;
  /** URL publique pour utiliser la carte (réservation) */
  reservationUrl: string;
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildGiftCardAdminIssuedEmail(input: GiftCardAdminIssuedInput) {
  const amount = formatCents(input.initialAmountCents);
  const expiry = formatDateFr(input.expiresAt);
  const subject = `Votre carte cadeau Clochette Nails — ${amount}`;

  const text = [
    `Bonjour ${input.recipientFirstName},`,
    ``,
    `Vous venez de recevoir une carte cadeau Clochette Nails d'une valeur de ${amount}.`,
    ``,
    `Code : ${input.code}`,
    `Valable jusqu'au ${expiry}.`,
    ``,
    input.message ? `Message : « ${input.message} »` : ``,
    input.message ? `` : ``,
    `Pour l'utiliser, prenez RDV sur :`,
    input.reservationUrl,
    ``,
    `Utilisable pour régler une réservation en ligne, acheter un ebook, ou payer directement votre prestation au salon.`,
    `À très vite,`,
    `{{signature}}`,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  const messageBlock = input.message
    ? `
      <div style="margin: 24px 0; padding: 16px 20px; background: ${COLORS.violet50}; border-left: 3px solid ${COLORS.violet600}; border-radius: 4px;">
        <p style="margin: 0 0 4px; font-size: 12px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.08em;">Message</p>
        <p style="margin: 0; font-size: 14px; color: ${COLORS.ink700}; font-style: italic;">« ${escapeHtml(input.message)} »</p>
      </div>`
    : "";

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.recipientFirstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Vous venez de recevoir une carte cadeau Clochette Nails.
    </p>

    <div style="margin: 24px 0; padding: 24px; background: ${COLORS.paper}; border: 2px solid ${COLORS.violet600}; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 12px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.14em;">Montant</p>
      <p style="margin: 0 0 18px; font-size: 28px; color: ${COLORS.violet700}; font-weight: 600;">${amount}</p>

      <p style="margin: 0 0 6px; font-size: 12px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.14em;">Votre code</p>
      <p style="margin: 0 0 14px; font-family: 'Courier New', monospace; font-size: 20px; color: ${COLORS.ink900}; letter-spacing: 0.05em;">${escapeHtml(input.code)}</p>

      <p style="margin: 0; font-size: 13px; color: ${COLORS.ink500};">
        Valable jusqu'au ${expiry}
      </p>
    </div>

    ${messageBlock}

    <div style="margin: 24px 0; text-align: center;">
      <a href="${input.reservationUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        Prendre RDV
      </a>
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Utilisable pour régler une réservation en ligne, acheter un ebook, ou payer
      directement votre prestation au salon. Conservez cet email : il contient
      votre code unique.
    </p>
  `;

  const html = emailLayout({
    title: "Votre carte cadeau",
    subtitle: amount,
    contentHtml,
    preheader: `Code : ${input.code} · Valable jusqu'au ${expiry}`,
  });

  return { subject, html, text };
}
