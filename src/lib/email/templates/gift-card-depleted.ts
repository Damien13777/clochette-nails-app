/**
 * Email envoyé automatiquement à la cliente / bénéficiaire d'une carte cadeau
 * dès que son solde tombe à zéro (status → FULLY_USED).
 *
 * Ton : remerciement chaleureux, pas de relance commerciale agressive.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type GiftCardDepletedInput = {
  firstName: string;
  prefix: string; // 4 derniers chars du code, pour identification
  initialAmountCents: number;
  reservationUrl: string;
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function buildGiftCardDepletedEmail(input: GiftCardDepletedInput) {
  const initial = formatCents(input.initialAmountCents);
  const subject = `Votre carte cadeau Clochette Nails est entièrement utilisée`;

  const text = [
    `Bonjour ${input.firstName},`,
    ``,
    `Votre carte cadeau Clochette Nails (••${input.prefix}, valeur initiale ${initial}) vient d'être entièrement utilisée.`,
    ``,
    `Merci de votre confiance — j'espère que vous avez été pleinement satisfaite.`,
    ``,
    `Pour réserver un prochain RDV ou offrir une carte cadeau à votre tour :`,
    input.reservationUrl,
    ``,
    `À très vite,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.firstName)},
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Votre carte cadeau Clochette Nails (<strong>••${escapeHtml(input.prefix)}</strong>,
      valeur initiale ${initial}) vient d'être entièrement utilisée.
    </p>

    <div style="margin: 24px 0; padding: 18px 22px; background: ${COLORS.violet50}; border-radius: 6px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: ${COLORS.ink700}; font-style: italic;">
        Merci de votre confiance — j'espère que vous avez été pleinement satisfaite.
      </p>
    </div>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${input.reservationUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        Prendre RDV
      </a>
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      À très vite,<br/>{{signature}}
    </p>
  `;

  const html = emailLayout({
    title: "Carte cadeau utilisée",
    subtitle: `••${input.prefix}`,
    contentHtml,
    preheader: `Votre carte ••${input.prefix} (${initial}) est entièrement utilisée.`,
  });

  return { subject, html, text };
}
