/**
 * Email envoyé à l'admin (Chloé) quand une carte cadeau est VENDUE (paiement
 * public confirmé via Stripe). Pendant du `booking-notif-admin` pour les RDV :
 * complète la Notification in-app (cloche) au cas où Chloé ne se connecte pas.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type GiftCardNotifAdminInput = {
  giftCardId: string;
  prefix: string;
  amountCents: number;
  buyerName: string;
  buyerEmail: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  giftMessage?: string | null;
  purchasedAt: Date;
  expiresAt: Date;
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

export function buildGiftCardNotifAdminEmail(input: GiftCardNotifAdminInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const adminUrl = `${siteUrl}/admin/cartes-cadeau/${input.giftCardId}`;
  const isGift =
    !!input.recipientEmail && input.recipientEmail !== input.buyerEmail;
  const amountFr = formatCents(input.amountCents);
  const expiresFr = formatDateFr(input.expiresAt);

  const subject = `🎁 Carte cadeau vendue · ${amountFr} · ${input.buyerName}`;

  const text = [
    `Nouvelle carte cadeau vendue !`,
    ``,
    `Montant       : ${amountFr}`,
    `Code (préfixe): ${input.prefix}…`,
    `Expire le     : ${expiresFr}`,
    ``,
    `Acheteuse : ${input.buyerName}`,
    `Email     : ${input.buyerEmail}`,
    isGift
      ? `Pour      : ${input.recipientName ?? ""} (${input.recipientEmail})`
      : `Pour      : elle-même`,
    ``,
    input.giftMessage ? `Message cadeau :\n${input.giftMessage}\n` : "",
    `Voir la carte cadeau : ${adminUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const recipientRow = isGift
    ? `<tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Pour</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.recipientName ?? "—")} · <a href="mailto:${escapeHtml(input.recipientEmail ?? "")}" style="color:${COLORS.violet700};">${escapeHtml(input.recipientEmail ?? "")}</a></td>
      </tr>`
    : `<tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Pour</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">Elle-même</td>
      </tr>`;

  const messageHtml = input.giftMessage
    ? `<div style="background-color:${COLORS.cream};border-left:3px solid ${COLORS.violet600};padding:12px 16px;border-radius:4px;margin:0 0 20px 0;">
        <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
          Message cadeau
        </p>
        <p style="margin:0;font-style:italic;color:${COLORS.ink700};white-space:pre-wrap;">
          ${escapeHtml(input.giftMessage)}
        </p>
      </div>`
    : "";

  const contentHtml = `
    <p style="margin:0 0 20px 0;font-size:16px;color:${COLORS.ink900};">
      Une carte cadeau vient d'être vendue 🎁
    </p>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Carte cadeau
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Montant</td>
        <td style="padding:6px 0;color:${COLORS.ink900};font-weight:500;">${amountFr}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Code (préfixe)</td>
        <td style="padding:6px 0;color:${COLORS.ink900};font-family:ui-monospace,monospace;">${escapeHtml(input.prefix)}…</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Expire le</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(expiresFr)}</td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-top:1px solid ${COLORS.line};padding-top:16px;">
      <tr>
        <td colspan="2" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Acheteuse
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Nom</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.buyerName)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Email</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="mailto:${escapeHtml(input.buyerEmail)}" style="color:${COLORS.violet700};">${escapeHtml(input.buyerEmail)}</a></td>
      </tr>
      ${recipientRow}
    </table>

    ${messageHtml}

    <div style="margin:24px 0 0 0;text-align:center;">
      <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Voir la carte cadeau dans l'admin
      </a>
    </div>
  `;

  const html = emailLayout({
    title: "Carte cadeau vendue",
    subtitle: `${amountFr} · ${input.buyerName}`,
    contentHtml,
    preheader: `${input.buyerName} a acheté une carte cadeau de ${amountFr}.`,
  });

  return { subject, html, text };
}
