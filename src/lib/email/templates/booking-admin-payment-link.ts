/**
 * Email envoyé à la cliente quand l'admin (Chloé) crée un RDV depuis le
 * calendrier et choisit "Envoyer lien de paiement par email".
 *
 * Diffère de booking-confirmation :
 *  - Le RDV n'est PAS encore confirmé (statut AWAITING_DEPOSIT)
 *  - Gros CTA "Régler l'acompte" → Stripe Checkout
 *  - Mention claire du délai (24h) et de l'annulation auto si pas payé
 *
 * Une fois le paiement reçu, le webhook Stripe enverra le mail booking-confirmation
 * standard (avec liens d'annulation/déplacement).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingAdminPaymentLinkInput = {
  clientFirstName: string;
  serviceTitle: string;
  optionsTitles: string[];
  date: Date;
  startTime: string;
  endTime: string;
  totalDurationMinutes: number;
  depositCents: number;
  /** URL Stripe Checkout (24h de validité) */
  checkoutUrl: string;
  /** Heures restantes avant expiration du lien (typiquement 24) */
  expiresInHours: number;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function buildBookingAdminPaymentLinkEmail(
  input: BookingAdminPaymentLinkInput,
) {
  const dateFr = formatDateFr(input.date);
  const subject = `Votre RDV chez Clochette Nails — Acompte à régler`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Le salon Clochette Nails vient de créer un rendez-vous à votre nom.`,
    `Pour valider définitivement ce RDV, merci de régler l'acompte via le lien ci-dessous.`,
    ``,
    `→ ${input.serviceTitle}${input.optionsTitles.length > 0 ? ` (avec : ${input.optionsTitles.join(", ")})` : ""}`,
    `→ ${dateFr}`,
    `→ ${input.startTime} – ${input.endTime} (${formatDuration(input.totalDurationMinutes)})`,
    ``,
    `Acompte à régler : ${formatCents(input.depositCents)}`,
    ``,
    `Régler l'acompte : ${input.checkoutUrl}`,
    ``,
    `⏱ Lien valable ${input.expiresInHours} heures. Sans paiement dans ce délai, le rendez-vous sera automatiquement annulé et le créneau libéré.`,
    ``,
    `Adresse : Moncoutant-sur-Sèvre, 79320`,
    `Téléphone : {{contactPhone}}`,
    ``,
    `À très bientôt,`,
    `Clochette Nails`,
  ].join("\n");

  const optionsHtml =
    input.optionsTitles.length > 0
      ? `<li style="margin:8px 0;color:${COLORS.ink700};">
          <strong style="color:${COLORS.ink900};">Options :</strong>
          ${escapeHtml(input.optionsTitles.join(", "))}
        </li>`
      : "";

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour <strong>${escapeHtml(input.clientFirstName)}</strong>,
    </p>
    <p style="margin:0 0 24px 0;">
      Le salon <strong>Clochette Nails</strong> vient de créer un rendez-vous à votre nom.
      Pour valider définitivement ce RDV, merci de régler l'acompte ci-dessous.
    </p>

    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:20px;margin:0 0 24px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
        Rendez-vous proposé
      </p>
      <p style="margin:0 0 16px 0;font-size:18px;color:${COLORS.ink900};font-weight:500;text-transform:capitalize;">
        ${escapeHtml(dateFr)}
      </p>
      <ul style="margin:0;padding:0;list-style:none;">
        <li style="margin:8px 0;color:${COLORS.ink700};">
          <strong style="color:${COLORS.ink900};">Prestation :</strong>
          ${escapeHtml(input.serviceTitle)}
        </li>
        ${optionsHtml}
        <li style="margin:8px 0;color:${COLORS.ink700};">
          <strong style="color:${COLORS.ink900};">Horaire :</strong>
          ${escapeHtml(input.startTime)} – ${escapeHtml(input.endTime)}
          <span style="color:${COLORS.ink500};">· ${formatDuration(input.totalDurationMinutes)}</span>
        </li>
      </ul>
    </div>

    <div style="background-color:${COLORS.violet50};border:1px solid ${COLORS.violet600}33;border-radius:8px;padding:18px 20px;margin:0 0 24px 0;text-align:center;">
      <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.violet700};">
        Acompte à régler maintenant
      </p>
      <p style="margin:0;font-size:28px;color:${COLORS.violet700};font-weight:600;line-height:1;">
        ${formatCents(input.depositCents)}
      </p>
    </div>

    <div style="text-align:center;margin:0 0 24px 0;">
      <a href="${input.checkoutUrl}" style="display:inline-block;padding:16px 32px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;font-weight:500;">
        Régler l'acompte (${formatCents(input.depositCents)})
      </a>
    </div>

    <div style="background-color:#fff5f0;border-left:3px solid #c87850;padding:12px 16px;border-radius:4px;margin:0 0 24px 0;">
      <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
        ⏱ <strong style="color:#c87850;">Lien valable ${input.expiresInHours} heures.</strong>
        Sans paiement dans ce délai, le rendez-vous sera automatiquement annulé
        et le créneau libéré.
      </p>
    </div>

    <p style="margin:0 0 12px 0;font-size:13px;color:${COLORS.ink500};">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
    </p>
    <p style="margin:0 0 24px 0;font-size:12px;color:${COLORS.ink500};word-break:break-all;">
      ${escapeHtml(input.checkoutUrl)}
    </p>

    <p style="margin:0 0 12px 0;">
      <strong style="color:${COLORS.ink900};">Adresse :</strong> Moncoutant-sur-Sèvre, 79320
    </p>
    <p style="margin:0 0 24px 0;">
      <strong style="color:${COLORS.ink900};">Une question ?</strong>
      Appelez-nous au <a href="{{contactPhoneHref}}" style="color:${COLORS.violet700};">{{contactPhone}}</a>.
    </p>

    <p style="margin:0;color:${COLORS.ink700};">
      À très bientôt,<br>
      <em style="color:${COLORS.violet700};">Clochette Nails</em>
    </p>
  `;

  const html = emailLayout({
    title: "Acompte à régler",
    subtitle: `${dateFr.charAt(0).toUpperCase() + dateFr.slice(1)} · ${input.startTime}`,
    contentHtml,
    preheader: `Votre RDV chez Clochette Nails — acompte de ${formatCents(input.depositCents)} à régler sous ${input.expiresInHours}h.`,
  });

  return { subject, html, text };
}
