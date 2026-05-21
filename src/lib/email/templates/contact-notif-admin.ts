/**
 * Email envoyé à l'admin quand le formulaire de contact landing est soumis.
 * Le reply-to pointe sur l'email de la cliente pour réponse directe.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type ContactNotifAdminInput = {
  contactMessageId: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
};

export function buildContactNotifAdminEmail(input: ContactNotifAdminInput) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const contactUrl = `${siteUrl}/admin/contacts`;

  const subjectClean = input.subject?.trim() || "(sans objet)";
  const emailSubject = `💬 Nouveau message · ${input.name} · ${subjectClean}`;

  const text = [
    `Nouveau message de contact :`,
    ``,
    `De      : ${input.name} <${input.email}>`,
    input.phone ? `Tél     : ${input.phone}` : "",
    `Objet   : ${subjectClean}`,
    ``,
    `Message :`,
    input.message,
    ``,
    `Voir dans l'admin : ${contactUrl}`,
    `Répondre directement : ${input.email}`,
  ]
    .filter(Boolean)
    .join("\n");

  const phoneRow = input.phone
    ? `<tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:120px;">Téléphone</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="tel:${escapeHtml(input.phone.replace(/[^+0-9]/g, ""))}" style="color:${COLORS.violet700};">${escapeHtml(input.phone)}</a></td>
      </tr>`
    : "";

  const contentHtml = `
    <p style="margin:0 0 20px 0;font-size:16px;color:${COLORS.ink900};">
      Nouveau message reçu via le formulaire de contact 💬
    </p>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;">
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:120px;">Nom</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.name)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Email</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="mailto:${escapeHtml(input.email)}" style="color:${COLORS.violet700};">${escapeHtml(input.email)}</a></td>
      </tr>
      ${phoneRow}
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Objet</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(subjectClean)}</td>
      </tr>
    </table>

    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:16px 20px;margin:0 0 24px 0;">
      <p style="margin:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
        Message
      </p>
      <p style="margin:0;color:${COLORS.ink700};white-space:pre-wrap;line-height:1.6;">
        ${escapeHtml(input.message)}
      </p>
    </div>

    <p style="margin:0 0 20px 0;font-size:13px;color:${COLORS.ink500};">
      Astuce : <strong style="color:${COLORS.ink700};">Répondez directement à cet email</strong> — il est paramétré pour que votre réponse parte vers ${escapeHtml(input.email)}.
    </p>

    <div style="margin:24px 0 0 0;text-align:center;">
      <a href="${contactUrl}" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Voir tous les contacts
      </a>
    </div>
  `;

  const html = emailLayout({
    title: "Nouveau message de contact",
    subtitle: `De ${input.name}`,
    contentHtml,
    preheader: `${input.name} vous a écrit : ${input.message.slice(0, 120)}...`,
  });

  return { subject: emailSubject, html, text };
}
