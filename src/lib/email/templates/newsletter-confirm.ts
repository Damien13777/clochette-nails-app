/**
 * Email de confirmation d'inscription newsletter — premier email du DOI.
 *
 * Tant que la cliente ne clique pas sur le lien de confirmation, son inscription
 * n'est PAS active (conforme CNIL).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type NewsletterConfirmInput = {
  /** URL absolue avec confirmToken (généré côté caller) */
  confirmUrl: string;
};

export function buildNewsletterConfirmEmail(input: NewsletterConfirmInput) {
  const subject = "Confirmez votre inscription à la newsletter Clochette Nails";

  const text = [
    `Bonjour,`,
    ``,
    `Vous avez demandé à recevoir notre newsletter. Confirmez votre inscription en cliquant sur le lien ci-dessous :`,
    ``,
    input.confirmUrl,
    ``,
    `Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucune inscription ne sera enregistrée.`,
    ``,
    `Ce lien est valable jusqu'à votre confirmation. Sans clic de votre part, aucun email commercial ne vous sera envoyé.`,
    ``,
    `Clochette Nails`,
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour,
    </p>
    <p style="margin:0 0 24px 0;">
      Vous avez demandé à recevoir la newsletter de <strong>Clochette Nails</strong>.
      Avant de finaliser, nous avons besoin que vous confirmiez votre inscription.
    </p>

    <div style="text-align:center;margin:0 0 28px 0;">
      <a href="${input.confirmUrl}" style="display:inline-block;padding:14px 28px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;font-weight:500;">
        Confirmer mon inscription
      </a>
    </div>

    <p style="margin:0 0 14px 0;font-size:13px;color:${COLORS.ink500};">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
    </p>
    <p style="margin:0 0 24px 0;font-size:12px;color:${COLORS.ink500};word-break:break-all;">
      ${escapeHtml(input.confirmUrl)}
    </p>

    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:14px 16px;margin:0 0 24px 0;">
      <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.
        Aucune inscription ne sera enregistrée sans confirmation de votre part.
      </p>
    </div>

    <p style="margin:0;color:${COLORS.ink700};font-size:14px;">
      À très bientôt,<br>
      <em style="color:${COLORS.violet700};">Clochette Nails</em>
    </p>
  `;

  const html = emailLayout({
    title: "Confirmez votre inscription",
    subtitle: "Newsletter Clochette Nails",
    contentHtml,
    preheader:
      "Une dernière étape pour finaliser votre inscription à la newsletter.",
  });

  return { subject, html, text };
}
