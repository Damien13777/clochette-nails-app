/**
 * Email de bienvenue envoyé après confirmation DOI.
 *
 * Confirme la finalisation de l'inscription + inclut OBLIGATOIREMENT
 * le lien de désinscription (RGPD).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type NewsletterWelcomeInput = {
  /** URL absolue avec unsubscribeToken (généré côté caller) */
  unsubscribeUrl: string;
};

export function buildNewsletterWelcomeEmail(input: NewsletterWelcomeInput) {
  const subject = "Bienvenue — vous êtes bien inscrite à la newsletter ✓";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

  const text = [
    `Bonjour,`,
    ``,
    `Votre inscription à la newsletter Clochette Nails est confirmée. Merci !`,
    ``,
    `Vous recevrez de temps en temps nos nouveautés : nouvelles prestations, conseils, offres ponctuelles et inspirations.`,
    ``,
    `Pas de spam, c'est promis — quelques emails par an seulement.`,
    ``,
    `Site : ${siteUrl}`,
    `Contact : {{contactEmail}}`,
    ``,
    `Vous changez d'avis ? Désinscription en un clic : ${input.unsubscribeUrl}`,
    ``,
    `À très bientôt,`,
    `Clochette Nails`,
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour,
    </p>
    <p style="margin:0 0 20px 0;">
      Votre inscription à la newsletter <strong>Clochette Nails</strong> est confirmée. Merci de votre confiance !
    </p>

    <div style="background-color:${COLORS.violet50};border-left:3px solid ${COLORS.violet600};padding:14px 18px;border-radius:0 6px 6px 0;margin:0 0 24px 0;">
      <p style="margin:0;font-size:14px;color:${COLORS.ink700};">
        Vous recevrez de temps en temps nos nouveautés :
        nouvelles prestations, conseils, offres ponctuelles et inspirations.
        Pas de spam, c'est promis — quelques emails par an seulement.
      </p>
    </div>

    <p style="margin:0 0 24px 0;color:${COLORS.ink700};font-size:14px;">
      À très bientôt,<br>
      <em style="color:${COLORS.violet700};">Clochette Nails</em>
    </p>

    <p style="margin:0;padding-top:16px;border-top:1px solid ${COLORS.line};font-size:12px;color:${COLORS.ink500};text-align:center;">
      Vous changez d'avis ?
      <a href="${input.unsubscribeUrl}" style="color:${COLORS.ink500};text-decoration:underline;">
        Se désinscrire en un clic
      </a>
      — votre adresse sera retirée immédiatement.
    </p>
    <p style="margin:6px 0 0 0;font-size:11px;color:${COLORS.ink300};word-break:break-all;text-align:center;">
      ${escapeHtml(input.unsubscribeUrl)}
    </p>
  `;

  const html = emailLayout({
    title: "Bienvenue ✓",
    subtitle: "Vous êtes inscrite à la newsletter Clochette Nails",
    contentHtml,
    preheader:
      "Votre inscription à la newsletter est confirmée. Merci de votre confiance.",
  });

  return { subject, html, text };
}
