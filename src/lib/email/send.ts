/**
 * Wrapper unifié pour envoyer un email — utilise Resend si configuré,
 * sinon log en console (dev fallback).
 *
 * Toutes les fonctions templates produisent { subject, html, text } et
 * c'est ce module qui sait comment livrer.
 *
 * Retour : { ok: true, id? } ou { ok: false, error }. Le caller décide
 * quoi faire en cas d'échec (ne pas bloquer le booking par exemple,
 * juste logger).
 */

import { resend, FROM_EMAIL } from "./client";
import { loadEmailGlobals } from "./globals";

// HTML escape minimal (footerNote vient d'admin, déjà saisi en texte brut)
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Tag analytics Resend (groupement dans le dashboard) */
  tag?: string;
  /** Pièces jointes (PDF factures…). Ignorées en mode mock (loggées). */
  attachments?: { filename: string; content: Buffer }[];
};

/**
 * Substitue les tokens globaux dans le subject/html/text d'un email.
 * Ajoute le footerNote en haut de l'email HTML s'il est défini.
 */
async function applyGlobals(msg: EmailMessage): Promise<EmailMessage> {
  const g = await loadEmailGlobals();

  // Suffix affiché après "Clochette Nails" dans le footer.
  // Si adresse renseignée → " · 12 rue Truc, Ville", sinon "" (rien).
  // L'adresse peut contenir des retours ligne, on les transforme en " · "
  // pour rester sur une seule ligne footer.
  const addressSuffix = g.salonAddress
    ? ` · ${g.salonAddress.replace(/\s*\n+\s*/g, " · ")}`
    : "";

  // Bannières image (header + footer) — TR table-row complète, vide si pas d'URL.
  // Logo (width <= 240) → centré avec padding. Bannière (width 600) → full width.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
  const imageRow = (url: string | null, width: number | null) => {
    if (!url) return "";
    const w = width ?? 600;
    const isLogo = w < 600;
    if (isLogo) {
      return `<tr><td style="padding:24px 32px 0 32px;text-align:center;line-height:0;font-size:0;"><a href="${escapeHtml(
        siteUrl,
      )}" style="display:inline-block;"><img src="${escapeHtml(url)}" alt="" width="${w}" style="display:block;max-width:${w}px;width:100%;height:auto;border:0;" /></a></td></tr>`;
    }
    return `<tr><td style="padding:0;line-height:0;font-size:0;"><a href="${escapeHtml(
      siteUrl,
    )}" style="display:block;"><img src="${escapeHtml(url)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></a></td></tr>`;
  };

  const replace = (s: string) =>
    s
      .replaceAll("{{signature}}", g.signature)
      .replaceAll("{{contactEmail}}", g.contactEmail)
      .replaceAll("{{contactPhone}}", g.contactPhone)
      .replaceAll("{{contactPhoneHref}}", g.contactPhoneHref)
      .replaceAll("{{salonAddressSuffix}}", escapeHtml(addressSuffix))
      .replaceAll(
        "{{headerImageRow}}",
        imageRow(g.headerImageUrl, g.headerImageWidth),
      )
      .replaceAll(
        "{{footerImageRow}}",
        imageRow(g.footerImageUrl, g.footerImageWidth),
      );

  // Footer note (bandeau saisonnier) — injecté juste SOUS la card email,
  // dans le même td centré, avec un léger gap pour respiration.
  const footerNoteBelowCard =
    g.footerNote && g.footerNote.trim().length > 0
      ? `<div style="max-width:600px;margin:12px auto 0 auto;padding:12px 16px;background:#fff5e6;border:1px solid #f3d9a4;border-radius:6px;color:#7a5a1f;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;text-align:center;">${escapeHtml(
          g.footerNote,
        )}</div>`
      : "";

  const html = replace(msg.html).replaceAll(
    "{{footerNoteBelowCard}}",
    footerNoteBelowCard,
  );
  const text = replace(msg.text);
  const subject = replace(msg.subject);

  return { ...msg, html, text, subject };
}

export async function sendEmail(rawMsg: EmailMessage): Promise<SendResult> {
  const msg = await applyGlobals(rawMsg);

  // Mode dev sans clé Resend : log + simulate success
  if (!resend) {
    console.log(
      `\n[email mock] À envoyer :\n` +
        `  To      : ${Array.isArray(msg.to) ? msg.to.join(", ") : msg.to}\n` +
        `  From    : ${FROM_EMAIL}\n` +
        `  Subject : ${msg.subject}\n` +
        `  Tag     : ${msg.tag ?? "(none)"}\n` +
        `  Attach  : ${msg.attachments?.map((a) => a.filename).join(", ") ?? "(none)"}\n` +
        `  --- TEXT ---\n${msg.text.split("\n").map((l) => `  ${l}`).join("\n")}\n`,
    );
    return { ok: true, id: "mock-" + Date.now() };
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      // Resend impose : tags = [a-zA-Z0-9_-] uniquement.
      // On sanitize (remplace tout autre char par "-") pour rester safe
      // même si on ajoute un tag avec point/espace plus tard.
      ...(msg.tag
        ? { tags: [{ name: "category", value: sanitizeTag(msg.tag) }] }
        : {}),
      ...(msg.attachments && msg.attachments.length > 0
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          }
        : {}),
    });

    if (result.error) {
      console.error("[email] Resend error:", result.error);
      return { ok: false, error: result.error.message ?? "Erreur Resend" };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    console.error("[email] send exception:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    };
  }
}

/**
 * Resend n'accepte que [a-zA-Z0-9_-] dans les tags.
 * On remplace tout le reste (points, espaces, etc.) par "-".
 */
function sanitizeTag(tag: string): string {
  return tag.replace(/[^a-zA-Z0-9_-]/g, "-");
}
