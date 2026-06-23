/**
 * Email de demande d'avis Google, envoyé (opt-in) à la cliente après un RDV
 * honoré. Ton chaleureux, sans pression. Un seul CTA vers le lien d'avis Google.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingReviewRequestInput = {
  clientFirstName: string;
  serviceTitle: string;
  /** Lien court d'avis Google (PlatformSettings.googleReviewUrl). */
  reviewUrl: string;
};

export function buildBookingReviewRequestEmail(input: BookingReviewRequestInput) {
  const subject = "Comment s'est passé votre rendez-vous ? 🌸";

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Merci d'être venue pour votre ${input.serviceTitle} !`,
    ``,
    `Votre avis compte énormément pour un petit salon comme le nôtre.`,
    `Si vous avez deux minutes, un mot sur Google fait toute la différence :`,
    input.reviewUrl,
    ``,
    `Merci infiniment, et à très vite,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Merci d'être venue pour votre <strong>${escapeHtml(input.serviceTitle)}</strong> !
      J'espère que vous êtes repartie ravie.
    </p>

    <div style="margin: 24px 0; padding: 18px 22px; background: ${COLORS.violet50}; border-radius: 6px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: ${COLORS.ink700}; font-style: italic;">
        Votre avis compte énormément pour un petit salon — quelques mots sur Google
        font toute la différence.
      </p>
    </div>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${input.reviewUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        ⭐ Laisser un avis sur Google
      </a>
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Merci infiniment,<br/>{{signature}}
    </p>
  `;

  const html = emailLayout({
    title: "Votre avis compte",
    subtitle: input.serviceTitle,
    contentHtml,
    preheader: "Un petit mot sur Google ferait toute la différence 🌸",
  });

  return { subject, html, text };
}
