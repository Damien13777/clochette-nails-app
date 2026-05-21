/**
 * Email cliente — notification de remboursement de son achat ebook.
 * Détail de la portion Stripe vs carte cadeau remboursée. Le lien de
 * téléchargement n'est plus valide (révoqué).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type EbookRefundedInput = {
  clientFirstName: string;
  ebookTitle: string;
  /** Total remboursé (Stripe + GC) */
  refundedCents: number;
  stripeRefundedCents: number;
  giftCardRefundedCents: number;
  giftCardPrefix?: string | null;
  reason?: string | null;
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function buildEbookRefundedEmail(input: EbookRefundedInput) {
  const subject = `Remboursement de votre ebook — « ${input.ebookTitle} »`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Votre achat de l'ebook « ${input.ebookTitle} » a été remboursé.`,
    ``,
    `Montant remboursé : ${formatCents(input.refundedCents)}`,
    input.stripeRefundedCents > 0
      ? `- Carte bancaire : ${formatCents(input.stripeRefundedCents)} (sous 3-5 jours ouvrés)`
      : ``,
    input.giftCardRefundedCents > 0
      ? `- Carte cadeau ${input.giftCardPrefix ?? ""} : ${formatCents(input.giftCardRefundedCents)} re-créditée`
      : ``,
    input.reason ? `` : ``,
    input.reason ? `Motif : ${input.reason}` : ``,
    ``,
    `Le lien de téléchargement précédent n'est plus actif.`,
    ``,
    `À bientôt,`,
    `{{signature}}`,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  const stripeLine = input.stripeRefundedCents > 0
    ? `
      <tr>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink700};">Carte bancaire</td>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${formatCents(input.stripeRefundedCents)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 0 0 6px; font-size: 11px; color: ${COLORS.ink500}; font-style: italic;">Crédit visible sur votre compte sous 3-5 jours ouvrés.</td>
      </tr>`
    : "";

  const gcLine = input.giftCardRefundedCents > 0
    ? `
      <tr>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink700};">Carte cadeau ${input.giftCardPrefix ? escapeHtml(`•${input.giftCardPrefix}`) : ""}</td>
        <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${formatCents(input.giftCardRefundedCents)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 0 0 6px; font-size: 11px; color: ${COLORS.ink500}; font-style: italic;">Re-créditée sur votre carte cadeau, utilisable à nouveau.</td>
      </tr>`
    : "";

  const reasonBlock = input.reason
    ? `
      <div style="margin: 24px 0; padding: 14px 18px; background: ${COLORS.violet50}; border-left: 3px solid ${COLORS.violet600}; border-radius: 4px;">
        <p style="margin: 0 0 4px; font-size: 11px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.08em;">Motif</p>
        <p style="margin: 0; font-size: 14px; color: ${COLORS.ink700};">${escapeHtml(input.reason)}</p>
      </div>`
    : "";

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Votre achat de l'ebook <strong>« ${escapeHtml(input.ebookTitle)} »</strong>
      a été remboursé.
    </p>

    <table style="width: 100%; margin: 24px 0; border-collapse: collapse;">
      ${stripeLine}
      ${gcLine}
      <tr>
        <td style="padding: 10px 0 6px; font-size: 14px; color: ${COLORS.ink900}; font-weight: 600; border-top: 1px solid ${COLORS.line};">Total remboursé</td>
        <td style="padding: 10px 0 6px; font-size: 14px; color: ${COLORS.ink900}; font-weight: 600; text-align: right; border-top: 1px solid ${COLORS.line};">${formatCents(input.refundedCents)}</td>
      </tr>
    </table>

    ${reasonBlock}

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Le lien de téléchargement envoyé précédemment n'est plus actif.
      N'hésitez pas à nous écrire pour toute question.
    </p>
  `;

  const html = emailLayout({
    title: "Remboursement confirmé",
    subtitle: formatCents(input.refundedCents),
    contentHtml,
    preheader: `Votre achat ebook a été remboursé de ${formatCents(input.refundedCents)}.`,
  });

  return { subject, html, text };
}
