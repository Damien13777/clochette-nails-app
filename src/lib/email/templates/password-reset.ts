/**
 * Email avec lien de réinitialisation de mot de passe admin.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type PasswordResetInput = {
  resetUrl: string;
  expiresInMinutes: number;
};

export function buildPasswordResetEmail(input: PasswordResetInput) {
  const subject = "Réinitialisation de votre mot de passe admin";

  const text = [
    `Vous avez demandé à réinitialiser votre mot de passe admin Clochette Nails.`,
    ``,
    `Cliquez sur le lien suivant pour choisir un nouveau mot de passe :`,
    input.resetUrl,
    ``,
    `Ce lien expire dans ${input.expiresInMinutes} minutes.`,
    ``,
    `Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe actuel reste valide.`,
    ``,
    `— Clochette Nails`,
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour,
    </p>
    <p style="margin:0 0 24px 0;">
      Vous avez demandé à réinitialiser votre mot de passe admin pour
      Clochette Nails. Cliquez sur le bouton ci-dessous pour choisir un
      nouveau mot de passe :
    </p>

    <div style="text-align:center;margin:0 0 24px 0;">
      <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;padding:14px 28px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Réinitialiser mon mot de passe
      </a>
    </div>

    <p style="margin:0 0 24px 0;font-size:13px;color:${COLORS.ink500};text-align:center;">
      Ou copiez-collez ce lien dans votre navigateur :<br>
      <span style="word-break:break-all;color:${COLORS.violet700};">${escapeHtml(input.resetUrl)}</span>
    </p>

    <div style="background-color:${COLORS.cream};border-left:3px solid ${COLORS.violet600};padding:12px 16px;border-radius:4px;margin:0 0 24px 0;">
      <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
        <strong style="color:${COLORS.violet700};">⏱ Expiration</strong> — Ce lien est valable
        <strong>${input.expiresInMinutes} minutes</strong>. Au-delà, il faudra
        en demander un nouveau.
      </p>
    </div>

    <p style="margin:0;font-size:13px;color:${COLORS.ink500};">
      <strong style="color:${COLORS.ink700};">Vous n'êtes pas à l'origine de cette demande ?</strong>
      Ignorez simplement cet email — votre mot de passe actuel reste valide
      et personne ne peut accéder à votre compte sans cliquer sur ce lien.
    </p>
  `;

  const html = emailLayout({
    title: "Réinitialisation de mot de passe",
    contentHtml,
    preheader: `Lien de réinitialisation, valable ${input.expiresInMinutes} min.`,
  });

  return { subject, html, text };
}
