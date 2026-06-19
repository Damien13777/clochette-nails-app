/**
 * Email envoyé à l'admin (Chloé) quand un ebook est VENDU (paiement public
 * confirmé via Stripe). Pendant du `gift-card-notif-admin` et du
 * `booking-notif-admin` : complète la Notification in-app (cloche) au cas où
 * Chloé ne se connecte pas.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type EbookNotifAdminInput = {
  purchaseId: string;
  ebookTitle: string;
  amountCents: number;
  buyerName?: string | null;
  buyerEmail: string;
  giftCardAmountCents?: number | null;
  stripePaidCents: number;
  purchasedAt: Date;
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function buildEbookNotifAdminEmail(input: EbookNotifAdminInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const adminUrl = `${siteUrl}/admin/ebooks/ventes/${input.purchaseId}`;
  const buyerLabel = input.buyerName?.trim() || input.buyerEmail;
  const amountFr = formatCents(input.amountCents);
  const usedGiftCard =
    !!input.giftCardAmountCents && input.giftCardAmountCents > 0;

  const subject = `📘 Ebook vendu · ${input.ebookTitle} · ${amountFr}`;

  const text = [
    `Nouvel ebook vendu !`,
    ``,
    `Ebook   : ${input.ebookTitle}`,
    `Montant : ${amountFr}`,
    usedGiftCard
      ? `Détail  : ${formatCents(input.stripePaidCents)} carte bancaire + ${formatCents(input.giftCardAmountCents ?? 0)} carte cadeau`
      : ``,
    ``,
    `Acheteuse : ${buyerLabel}`,
    `Email     : ${input.buyerEmail}`,
    ``,
    `Voir la vente : ${adminUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const breakdownRow = usedGiftCard
    ? `<tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Détail</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(formatCents(input.stripePaidCents))} carte bancaire · ${escapeHtml(formatCents(input.giftCardAmountCents ?? 0))} carte cadeau</td>
      </tr>`
    : "";

  const contentHtml = `
    <p style="margin:0 0 20px 0;font-size:16px;color:${COLORS.ink900};">
      Un ebook vient d'être vendu 📘
    </p>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Ebook
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Titre</td>
        <td style="padding:6px 0;color:${COLORS.ink900};font-weight:500;">${escapeHtml(input.ebookTitle)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Montant</td>
        <td style="padding:6px 0;color:${COLORS.ink900};font-weight:500;">${amountFr}</td>
      </tr>
      ${breakdownRow}
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-top:1px solid ${COLORS.line};padding-top:16px;">
      <tr>
        <td colspan="2" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Acheteuse
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Nom</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(buyerLabel)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Email</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="mailto:${escapeHtml(input.buyerEmail)}" style="color:${COLORS.violet700};">${escapeHtml(input.buyerEmail)}</a></td>
      </tr>
    </table>

    <div style="margin:24px 0 0 0;text-align:center;">
      <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Voir la vente dans l'admin
      </a>
    </div>
  `;

  const html = emailLayout({
    title: "Ebook vendu",
    subtitle: `${input.ebookTitle} · ${amountFr}`,
    contentHtml,
    preheader: `${buyerLabel} a acheté « ${input.ebookTitle} » (${amountFr}).`,
  });

  return { subject, html, text };
}
