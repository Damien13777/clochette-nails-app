/**
 * Template d'une campagne newsletter envoyée aux abonnées confirmées.
 *
 * Particularités :
 *  - Le contenu HTML provient de TipTap (sanitizé par DOMPurify côté caller)
 *  - Lien de désabonnement OBLIGATOIRE (CNIL) — utilise le unsubscribeToken
 *    propre à chaque abonnée
 *  - Préheader optionnel (apparaît dans la preview boîte mail)
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type NewsletterCampaignInput = {
  /** Sujet de l'email — utilisé tel quel comme objet ET comme H1 du wrapper */
  subject: string;
  preheader?: string | null;
  /** HTML déjà sanitizé (TipTap → DOMPurify) */
  contentHtml: string;
  /** URL absolue de désabonnement (avec unsubscribeToken) */
  unsubscribeUrl: string;
  /** URL du site (pour le lien dans le footer) */
  siteUrl: string;
};

export function buildNewsletterCampaignEmail(input: NewsletterCampaignInput) {
  const subject = input.subject;
  const preheader = input.preheader ?? undefined;

  // Footer dédié newsletter — contient le lien désabo (RGPD) + lien site
  const footerHtml = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${COLORS.line}; font-size: 12px; color: ${COLORS.ink500}; line-height: 1.6; text-align: center;">
      <p style="margin: 0 0 8px;">
        Vous recevez ce mail car vous êtes inscrite à la lettre du salon Clochette Nails.
      </p>
      <p style="margin: 0;">
        <a href="${input.unsubscribeUrl}" style="color: ${COLORS.ink500}; text-decoration: underline;">
          Se désabonner
        </a>
        <span style="margin: 0 8px;">·</span>
        <a href="${input.siteUrl}" style="color: ${COLORS.ink500}; text-decoration: underline;">
          Voir le site
        </a>
      </p>
    </div>
  `;

  // Le content vient déjà stylé (rich-content via CSS) — ici on l'injecte tel
  // quel dans le wrapper de l'email. On ne ré-applique pas de styles inline
  // pour éviter les conflits avec ce que DOMPurify a laissé passer.
  const contentHtml = `
    <div style="font-size: 15px; color: ${COLORS.ink900}; line-height: 1.7;">
      ${input.contentHtml}
    </div>
    ${footerHtml}
  `;

  const html = emailLayout({
    title: subject,
    contentHtml,
    preheader,
  });

  // Version texte : on strippe les balises HTML pour fournir un fallback
  // pour les clients mail qui ne supportent pas le HTML (rare aujourd'hui
  // mais bonne pratique).
  const text = stripHtml(input.contentHtml) + `\n\n---\nSe désabonner : ${input.unsubscribeUrl}\n${input.siteUrl}`;

  return { subject, html, text };
}

/** Strip basique de balises HTML pour fallback texte. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Re-export pour clarté côté caller (déjà escapeHtml dispo via le wrapper)
export { escapeHtml };
