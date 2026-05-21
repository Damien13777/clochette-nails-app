/**
 * Email envoyé quand l'admin réémet le lien (ancien lien révoqué).
 * Le compteur est rejouable pour 1 téléchargement supplémentaire.
 * L'ancien lien envoyé précédemment ne fonctionne plus (token régénéré).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type EbookReissuedInput = {
  clientFirstName: string;
  ebookTitle: string;
  downloadUrl: string;
  tokenExpiresAt: Date;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildEbookReissuedEmail(input: EbookReissuedInput) {
  const expiry = formatDateFr(input.tokenExpiresAt);
  const subject = `Nouveau lien de téléchargement — « ${input.ebookTitle} »`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Voici un nouveau lien pour télécharger votre ebook « ${input.ebookTitle} » :`,
    input.downloadUrl,
    ``,
    `IMPORTANT : ce lien remplace le précédent (qui n'est plus valide) et est utilisable une seule fois.`,
    `Lien valide jusqu'au ${expiry}.`,
    ``,
    `Si vous rencontrez un nouveau souci, contactez-nous.`,
    ``,
    `À bientôt,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Voici un nouveau lien pour télécharger votre ebook
      <strong>« ${escapeHtml(input.ebookTitle)} »</strong>.
    </p>

    <div style="margin: 24px 0; padding: 24px; background: ${COLORS.paper}; border: 2px solid ${COLORS.violet600}; border-radius: 8px; text-align: center;">
      <a href="${input.downloadUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        Télécharger le PDF
      </a>
      <p style="margin: 18px 0 0; font-size: 12px; color: ${COLORS.ink500};">
        Utilisable une fois · Lien valide jusqu'au ${expiry}
      </p>
    </div>

    <div style="margin: 24px 0; padding: 14px 18px; background: #fff5e6; border-left: 3px solid #f3d9a4; border-radius: 4px;">
      <p style="margin: 0; font-size: 13px; color: #7a5a1f; line-height: 1.5;">
        <strong>À noter :</strong> le lien envoyé précédemment n'est plus
        valide. Ce nouveau lien est utilisable une seule fois.
      </p>
    </div>
  `;

  const html = emailLayout({
    title: "Nouveau lien de téléchargement",
    subtitle: input.ebookTitle,
    contentHtml,
    preheader: `Lien remplacement, utilisable 1 fois · valide jusqu'au ${expiry}`,
  });

  return { subject, html, text };
}
