/**
 * Email "voici votre lien" envoyé manuellement depuis l'admin quand la
 * cliente a perdu le mail initial mais n'a pas atteint le cap de DL.
 * Même token que le mail original — le compteur n'est pas touché.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";
import { MAX_DOWNLOADS_PER_TOKEN } from "@/lib/ebook-download-token";

export type EbookResentInput = {
  clientFirstName: string;
  ebookTitle: string;
  downloadUrl: string;
  remainingDownloads: number;
  tokenExpiresAt: Date;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildEbookResentEmail(input: EbookResentInput) {
  const expiry = formatDateFr(input.tokenExpiresAt);
  const subject = `Votre lien de téléchargement — « ${input.ebookTitle} »`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Voici à nouveau le lien pour télécharger votre ebook « ${input.ebookTitle} » :`,
    input.downloadUrl,
    ``,
    `Il vous reste ${input.remainingDownloads} téléchargement${input.remainingDownloads > 1 ? "s" : ""} sur ${MAX_DOWNLOADS_PER_TOKEN}.`,
    `Lien valide jusqu'au ${expiry}.`,
    ``,
    `À bientôt,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Voici à nouveau le lien pour télécharger votre ebook
      <strong>« ${escapeHtml(input.ebookTitle)} »</strong>.
    </p>

    <div style="margin: 24px 0; padding: 24px; background: ${COLORS.paper}; border: 2px solid ${COLORS.violet600}; border-radius: 8px; text-align: center;">
      <a href="${input.downloadUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        Télécharger le PDF
      </a>
      <p style="margin: 18px 0 0; font-size: 12px; color: ${COLORS.ink500};">
        ${input.remainingDownloads} téléchargement${input.remainingDownloads > 1 ? "s" : ""} restant${input.remainingDownloads > 1 ? "s" : ""} · Lien valide jusqu'au ${expiry}
      </p>
    </div>
  `;

  const html = emailLayout({
    title: "Votre lien de téléchargement",
    subtitle: input.ebookTitle,
    contentHtml,
    preheader: `${input.remainingDownloads} téléchargement(s) restant(s) · valide jusqu'au ${expiry}`,
  });

  return { subject, html, text };
}
