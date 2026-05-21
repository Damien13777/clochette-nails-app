/**
 * Reçu d'achat d'une carte cadeau, envoyé à l'acheteuse.
 *
 * Cas d'usage :
 *  - ADMIN_SALE : vente en salon, paiement physique (espèces/CB/virement/chèque)
 *  - PUBLIC (futur) : achat via le site, paiement Stripe
 *
 * Le template adapte automatiquement le libellé du mode de paiement et n'expose
 * PAS le code de la carte cadeau (qui part dans un email séparé au bénéficiaire) :
 *  - Évite de "leaker" le code dans l'historique mail de l'acheteuse si elle
 *    achète pour offrir
 *  - Garde la séparation des rôles propre (acheteuse vs bénéficiaire)
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type GiftCardPurchaseReceiptInput = {
  buyerFirstName: string;
  /** Préfixe (4 derniers chars) — identifie la carte sans révéler le code. */
  prefix: string;
  amountCents: number;
  /** "stripe" | "cash" | "card_terminal" | "transfer" | "check" */
  paymentMethod: string;
  /** Si différent de l'acheteuse → mentionné dans le reçu. */
  recipientName?: string | null;
  /** Date de l'achat. */
  purchasedAt: Date;
  expiresAt: Date;
  /** Si Stripe, l'id du payment intent (utile en mention de pied). */
  stripePaymentId?: string | null;
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

function paymentLabel(method: string): string {
  switch (method) {
    case "stripe":
      return "Carte bancaire (en ligne)";
    case "cash":
      return "Espèces";
    case "card_terminal":
      return "TPE / Carte bancaire";
    case "transfer":
      return "Virement bancaire";
    case "check":
      return "Chèque";
    default:
      return method;
  }
}

export function buildGiftCardPurchaseReceiptEmail(
  input: GiftCardPurchaseReceiptInput,
) {
  const amount = formatCents(input.amountCents);
  const purchasedFr = formatDateFr(input.purchasedAt);
  const expiry = formatDateFr(input.expiresAt);
  const method = paymentLabel(input.paymentMethod);
  const subject = `Reçu d'achat — Carte cadeau Clochette Nails (${amount})`;

  const isForRecipient =
    !!input.recipientName && input.recipientName.trim().length > 0;

  const text = [
    `Bonjour ${input.buyerFirstName},`,
    ``,
    `Merci pour votre achat ! Voici le reçu de votre carte cadeau Clochette Nails.`,
    ``,
    `Carte : ••${input.prefix}`,
    `Montant : ${amount}`,
    `Mode de paiement : ${method}`,
    `Date d'achat : ${purchasedFr}`,
    `Validité : jusqu'au ${expiry}`,
    isForRecipient
      ? `Bénéficiaire : ${input.recipientName} (recevra le code par email séparé)`
      : `Le code d'utilisation vous a été envoyé dans un email séparé.`,
    ``,
    `Conservez ce reçu pour vos archives.`,
    ``,
    `À très vite,`,
    `{{signature}}`,
  ].join("\n");

  const recipientLine = isForRecipient
    ? `<p style="margin: 8px 0 0; font-size: 13px; color: ${COLORS.ink500};">
         Le code sera envoyé séparément à <strong>${escapeHtml(input.recipientName!)}</strong>.
       </p>`
    : `<p style="margin: 8px 0 0; font-size: 13px; color: ${COLORS.ink500};">
         Le code d'utilisation vous a été envoyé dans un email séparé.
       </p>`;

  const stripeFootnote = input.stripePaymentId
    ? `<p style="margin: 16px 0 0; font-size: 11px; color: ${COLORS.ink500}; font-family: monospace;">
         Réf. transaction : ${escapeHtml(input.stripePaymentId)}
       </p>`
    : "";

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.buyerFirstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Merci pour votre achat ! Voici le reçu de votre carte cadeau Clochette Nails.
    </p>

    <div style="margin: 24px 0; padding: 24px; background: ${COLORS.paper}; border: 1px solid ${COLORS.line}; border-radius: 8px;">
      <p style="margin: 0 0 6px; font-size: 11px; color: ${COLORS.ink500}; text-transform: uppercase; letter-spacing: 0.14em;">
        Reçu d'achat
      </p>
      <p style="margin: 0 0 18px; font-size: 26px; color: ${COLORS.violet700}; font-weight: 600;">
        ${amount}
      </p>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: ${COLORS.ink500};">Carte</td>
          <td style="padding: 4px 0; text-align: right; color: ${COLORS.ink900}; font-family: 'Courier New', monospace;">••${escapeHtml(input.prefix)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${COLORS.ink500};">Mode de paiement</td>
          <td style="padding: 4px 0; text-align: right; color: ${COLORS.ink900};">${escapeHtml(method)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${COLORS.ink500};">Date d'achat</td>
          <td style="padding: 4px 0; text-align: right; color: ${COLORS.ink900};">${purchasedFr}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${COLORS.ink500};">Validité</td>
          <td style="padding: 4px 0; text-align: right; color: ${COLORS.ink900};">jusqu'au ${expiry}</td>
        </tr>
      </table>

      ${recipientLine}
      ${stripeFootnote}
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Conservez ce reçu pour vos archives.
    </p>
    <p style="margin: 8px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      À très vite,<br/>{{signature}}
    </p>
  `;

  const html = emailLayout({
    title: "Reçu d'achat",
    subtitle: amount,
    contentHtml,
    preheader: `Reçu carte cadeau ••${input.prefix} · ${amount} · ${method}`,
  });

  return { subject, html, text };
}
