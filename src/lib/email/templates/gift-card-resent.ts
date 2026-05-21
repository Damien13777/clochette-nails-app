/**
 * Email de renvoi d'une carte cadeau existante (cliente a perdu son mail).
 *
 * Inclut :
 *  - Le code en clair (récupéré côté serveur depuis GiftCard.code)
 *  - Le SOLDE RESTANT actuel (pas le montant initial)
 *  - La date d'expiration en vigueur
 *  - Un message d'introduction mentionnant qu'il s'agit d'un renvoi
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type GiftCardResentInput = {
  firstName: string;
  code: string;
  remainingAmountCents: number;
  initialAmountCents: number;
  expiresAt: Date;
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

export function buildGiftCardResentEmail(input: GiftCardResentInput) {
  const remaining = formatCents(input.remainingAmountCents);
  const initial = formatCents(input.initialAmountCents);
  const isPartial = input.remainingAmountCents < input.initialAmountCents;
  const expiry = formatDateFr(input.expiresAt);
  const subject = `Votre carte cadeau Clochette Nails — Solde ${remaining}`;

  const text = [
    `Bonjour ${input.firstName},`,
    ``,
    `Voici un rappel de votre carte cadeau Clochette Nails.`,
    ``,
    `Code : ${input.code}`,
    `Solde restant : ${remaining}${isPartial ? ` (sur ${initial} initial)` : ""}`,
    `Valable jusqu'au ${expiry}.`,
    ``,
    `Pour l'utiliser, prenez RDV sur :`,
    input.reservationUrl,
    ``,
    `À très vite,`,
    `{{signature}}`,
  ].join("\n");

  const balanceLine = isPartial
    ? `<p style="margin: 0; font-size: 12px; color: ${COLORS.ink500};">sur ${initial} initial</p>`
    : "";

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.firstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Voici un rappel des informations de votre carte cadeau Clochette Nails.
    </p>

    <div style="margin: 24px 0; padding: 24px; background: ${COLORS.paper}; border: 2px solid ${COLORS.violet600}; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 12px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.14em;">Solde restant</p>
      <p style="margin: 0 0 4px; font-size: 28px; color: ${COLORS.violet700}; font-weight: 600;">${remaining}</p>
      ${balanceLine}

      <p style="margin: 18px 0 6px; font-size: 12px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.14em;">Votre code</p>
      <p style="margin: 0 0 14px; font-family: 'Courier New', monospace; font-size: 20px; color: ${COLORS.ink900}; letter-spacing: 0.05em;">${escapeHtml(input.code)}</p>

      <p style="margin: 0; font-size: 13px; color: ${COLORS.ink500};">
        Valable jusqu'au ${expiry}
      </p>
    </div>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${input.reservationUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        Prendre RDV
      </a>
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Conservez cet email : il contient votre code unique.
    </p>
  `;

  const html = emailLayout({
    title: "Votre carte cadeau",
    subtitle: remaining,
    contentHtml,
    preheader: `Code : ${input.code} · Solde ${remaining}`,
  });

  return { subject, html, text };
}
