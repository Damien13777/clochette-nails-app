/**
 * Layout HTML partagé pour tous les emails transactionnels.
 *
 * Contraintes email :
 *  - Styles inline obligatoires (clients email = no <style> support fiable)
 *  - Tables pour le layout (Outlook etc.)
 *  - Largeur fixe ~600px (standard email)
 *  - Pas de CSS variables (fallback hex)
 *  - Dark mode pas pris en charge (V1)
 *
 * Le contenu (slot) est inséré tel quel, donc les templates passent du HTML
 * déjà stylé inline. Le layout fournit juste le header (logo + nom) et le
 * footer (contact + RGPD).
 */

const BRAND = {
  cream: "#fafaf5",
  paper: "#ffffff",
  ink900: "#1a1a1a",
  ink700: "#444444",
  ink500: "#777777",
  ink300: "#bbbbbb",
  line: "#e6e6e2",
  violet600: "#6b46c1",
  violet700: "#553c9a",
  violet50: "#f5f0ff",
} as const;

export type EmailLayoutInput = {
  /** Titre H1 dans le header de l'email */
  title: string;
  /** Sous-titre optionnel sous le H1 */
  subtitle?: string;
  /** HTML du contenu principal (déjà stylé inline) */
  contentHtml: string;
  /** Texte preview qui apparaît dans l'aperçu de la boîte mail */
  preheader?: string;
};

export function emailLayout({
  title,
  subtitle,
  contentHtml,
  preheader,
}: EmailLayoutInput): string {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:${BRAND.ink900};-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;font-size:1px;color:transparent;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ""}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.cream};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${BRAND.paper};border:1px solid ${BRAND.line};border-radius:8px;overflow:hidden;">

          {{headerImageRow}}

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px 32px;text-align:center;border-bottom:1px solid ${BRAND.line};">
              <div style="display:inline-block;width:56px;height:56px;line-height:56px;background-color:${BRAND.violet600};color:#fff;border-radius:50%;font-size:24px;font-weight:600;letter-spacing:0.04em;margin-bottom:16px;">C</div>
              <h1 style="margin:0;font-size:24px;line-height:1.2;color:${BRAND.ink900};font-weight:500;">${escapeHtml(title)}</h1>
              ${subtitle ? `<p style="margin:8px 0 0 0;font-size:14px;color:${BRAND.ink500};">${escapeHtml(subtitle)}</p>` : ""}
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:28px 32px;font-size:15px;line-height:1.6;color:${BRAND.ink700};">
              ${contentHtml}
            </td>
          </tr>

          {{footerImageRow}}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:${BRAND.cream};border-top:1px solid ${BRAND.line};font-size:12px;line-height:1.5;color:${BRAND.ink500};text-align:center;">
              <p style="margin:0 0 8px 0;">
                <strong style="color:${BRAND.ink700};">Clochette Nails</strong>{{salonAddressSuffix}}
              </p>
              <p style="margin:0 0 12px 0;">
                <a href="${siteUrl}" style="color:${BRAND.violet700};text-decoration:none;">${siteUrl.replace(/^https?:\/\//, "")}</a>
                ·
                <a href="mailto:{{contactEmail}}" style="color:${BRAND.violet700};text-decoration:none;">{{contactEmail}}</a>
                ·
                <a href="{{contactPhoneHref}}" style="color:${BRAND.violet700};text-decoration:none;">{{contactPhone}}</a>
              </p>
              <p style="margin:0;color:${BRAND.ink300};font-size:11px;">
                <a href="${siteUrl}/confidentialite" style="color:${BRAND.ink300};text-decoration:underline;">Politique de confidentialité</a>
                ·
                <a href="${siteUrl}/mentions-legales" style="color:${BRAND.ink300};text-decoration:underline;">Mentions légales</a>
              </p>
            </td>
          </tr>

        </table>
        {{footerNoteBelowCard}}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const COLORS = BRAND;
