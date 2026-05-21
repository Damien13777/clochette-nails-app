/**
 * Email envoyé à la cliente après achat d'un ebook (Stripe ou couverture
 * intégrale par carte cadeau). Contient le lien signé de téléchargement
 * du PDF, valable 30 jours.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";
import { MAX_DOWNLOADS_PER_TOKEN } from "@/lib/ebook-download-token";

export type EbookPurchasedInput = {
  clientFirstName: string;
  ebookTitle: string;
  ebookShortDesc: string;
  amountPaidCents: number;
  giftCardAmountCents?: number;
  /** URL absolue vers /api/v1/ebooks/download/{token} */
  downloadUrl: string;
  /** Date d'expiration du lien (30j par défaut) */
  tokenExpiresAt: Date;
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

export function buildEbookPurchasedEmail(input: EbookPurchasedInput) {
  const totalCents =
    input.amountPaidCents + (input.giftCardAmountCents ?? 0);
  const subject = `Votre ebook « ${input.ebookTitle} » est prêt à télécharger`;
  const expiry = formatDateFr(input.tokenExpiresAt);

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Merci pour votre achat ! Votre ebook est prêt :`,
    `« ${input.ebookTitle} »`,
    ``,
    `Téléchargez-le ici :`,
    input.downloadUrl,
    ``,
    `Ce lien restera valide jusqu'au ${expiry} (${MAX_DOWNLOADS_PER_TOKEN} téléchargements maximum).`,
    ``,
    `Récapitulatif :`,
    `- Prix total : ${formatCents(totalCents)}`,
    input.giftCardAmountCents
      ? `- Carte cadeau : -${formatCents(input.giftCardAmountCents)}`
      : ``,
    `- Payé : ${formatCents(input.amountPaidCents)}`,
    ``,
    `Bonne lecture !`,
    `{{signature}}`,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  const giftCardLine = input.giftCardAmountCents
    ? `
      <tr>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink700};">Carte cadeau</td>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.violet700}; text-align: right;">−${formatCents(input.giftCardAmountCents)}</td>
      </tr>`
    : "";

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Merci pour votre achat ! Votre ebook est prêt à télécharger.
    </p>

    <div style="margin: 24px 0; padding: 24px; background: ${COLORS.paper}; border: 2px solid ${COLORS.violet600}; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 6px; font-size: 12px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.14em;">Votre ebook</p>
      <p style="margin: 0 0 12px; font-size: 22px; color: ${COLORS.ink900}; font-weight: 600;">${escapeHtml(input.ebookTitle)}</p>
      <p style="margin: 0 0 20px; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.5;">${escapeHtml(input.ebookShortDesc)}</p>

      <a href="${input.downloadUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        Télécharger le PDF
      </a>

      <p style="margin: 18px 0 0; font-size: 12px; color: ${COLORS.ink500};">
        Lien valide jusqu'au ${expiry} · ${MAX_DOWNLOADS_PER_TOKEN} téléchargements max
      </p>
    </div>

    <table style="width: 100%; margin: 24px 0; border-collapse: collapse;">
      <tr>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink700};">Prix de l'ebook</td>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${formatCents(totalCents)}</td>
      </tr>
      ${giftCardLine}
      <tr>
        <td style="padding: 10px 0 6px; font-size: 14px; color: ${COLORS.ink900}; font-weight: 600; border-top: 1px solid ${COLORS.line};">Payé</td>
        <td style="padding: 10px 0 6px; font-size: 14px; color: ${COLORS.ink900}; font-weight: 600; text-align: right; border-top: 1px solid ${COLORS.line};">${formatCents(input.amountPaidCents)}</td>
      </tr>
    </table>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Conservez cet email : le lien vous permettra de re-télécharger le PDF
      jusqu'à ${MAX_DOWNLOADS_PER_TOKEN} fois et jusqu'à son expiration.
      En cas de perte ou de souci, contactez-nous.
    </p>
  `;

  const html = emailLayout({
    title: "Votre ebook est prêt",
    subtitle: input.ebookTitle,
    contentHtml,
    preheader: `Téléchargez votre ebook. Lien valide jusqu'au ${expiry}.`,
  });

  return { subject, html, text };
}
