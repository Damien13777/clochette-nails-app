/**
 * Emails de rappel automatiques envoyés à la cliente avant son RDV :
 *  - J-7 (1 semaine avant) : rappel doux, propose de déplacer si besoin
 *  - J-1 (la veille)        : rappel ferme "à demain !"
 *
 * Envoyés par le cron /api/v1/cron/send-booking-reminders.
 * Promesse RGPD documentée dans /confidentialite.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingReminderInput = {
  clientFirstName: string;
  serviceTitle: string;
  optionsTitles: string[];
  date: Date;
  startTime: string;
  endTime: string;
  totalDurationMinutes: number;
  /** Token cliente pour annulation/déplacement en ligne (single-use) */
  clientActionToken?: string | null;
  /** Téléphone du salon (depuis email globals) */
  contactPhone: string;
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

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr"
  );
}

function detailsBlock(input: BookingReminderInput): string {
  const dateFr = formatDateFr(input.date);
  const optionsRow =
    input.optionsTitles.length > 0
      ? `
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: ${COLORS.ink500};">Options</td>
          <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${escapeHtml(input.optionsTitles.join(", "))}</td>
        </tr>`
      : "";
  return `
    <div style="margin: 24px 0; padding: 20px 24px; background: ${COLORS.paper}; border: 1px solid ${COLORS.line}; border-radius: 8px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: ${COLORS.ink500};">Prestation</td>
          <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${escapeHtml(input.serviceTitle)}</td>
        </tr>
        ${optionsRow}
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: ${COLORS.ink500};">Date</td>
          <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${escapeHtml(dateFr)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: ${COLORS.ink500};">Horaire</td>
          <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.ink900}; text-align: right;">${input.startTime} → ${input.endTime} (${formatDuration(input.totalDurationMinutes)})</td>
        </tr>
      </table>
    </div>
  `;
}

// ─── J-7 ────────────────────────────────────────────────────

export function buildBookingReminderJ7Email(input: BookingReminderInput) {
  const dateFr = formatDateFr(input.date);
  const subject = `Rappel : RDV dans 1 semaine · ${dateFr}`;

  const cancelUrl = input.clientActionToken
    ? `${siteUrl()}/reservation/annuler?token=${input.clientActionToken}`
    : null;
  const rescheduleUrl = input.clientActionToken
    ? `${siteUrl()}/reservation/deplacer?token=${input.clientActionToken}`
    : null;

  const actionsBlock = cancelUrl
    ? `
      <p style="margin: 16px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
        Vous devez modifier ou annuler ?
        <a href="${rescheduleUrl}" style="color: ${COLORS.violet700};">Déplacer mon RDV</a>
        ou
        <a href="${cancelUrl}" style="color: ${COLORS.violet700};">annuler</a>.
      </p>`
    : `<p style="margin: 16px 0 0; font-size: 13px; color: ${COLORS.ink500};">
        Besoin de modifier ? Contactez-nous au ${escapeHtml(input.contactPhone)}.
      </p>`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Petit rappel : votre RDV approche, dans une semaine !`,
    ``,
    `📅 ${dateFr}`,
    `🕐 ${input.startTime} → ${input.endTime} (${formatDuration(input.totalDurationMinutes)})`,
    `💅 ${input.serviceTitle}`,
    input.optionsTitles.length > 0 ? `   Options : ${input.optionsTitles.join(", ")}` : ``,
    ``,
    cancelUrl
      ? `Pour déplacer : ${rescheduleUrl}\nPour annuler : ${cancelUrl}`
      : `Pour toute modification : ${input.contactPhone}`,
    ``,
    `À très bientôt,`,
    `{{signature}}`,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>
    <p style="margin: 0 0 12px; font-size: 15px; color: ${COLORS.ink900};">
      Petit rappel : votre RDV approche, <strong>dans une semaine</strong>.
      C'est le bon moment pour préparer vos inspirations et nous prévenir si
      quelque chose change.
    </p>

    ${detailsBlock(input)}

    ${actionsBlock}
  `;

  const html = emailLayout({
    title: "RDV dans 1 semaine",
    subtitle: dateFr,
    contentHtml,
    preheader: `${dateFr} à ${input.startTime} — ${input.serviceTitle}`,
  });

  return { subject, html, text };
}

// ─── J-1 ────────────────────────────────────────────────────

export function buildBookingReminderJ1Email(input: BookingReminderInput) {
  const dateFr = formatDateFr(input.date);
  const subject = `À demain ! · RDV ${dateFr} à ${input.startTime}`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `À demain pour votre RDV chez Clochette Nails !`,
    ``,
    `📅 ${dateFr}`,
    `🕐 ${input.startTime} → ${input.endTime} (${formatDuration(input.totalDurationMinutes)})`,
    `💅 ${input.serviceTitle}`,
    input.optionsTitles.length > 0 ? `   Options : ${input.optionsTitles.join(", ")}` : ``,
    ``,
    `Pour toute modification de dernière minute, appelez-nous au ${input.contactPhone}.`,
    ``,
    `À demain,`,
    `{{signature}}`,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>
    <p style="margin: 0 0 12px; font-size: 15px; color: ${COLORS.ink900};">
      <strong>À demain !</strong> Voici un dernier rappel des détails de
      votre RDV.
    </p>

    ${detailsBlock(input)}

    <p style="margin: 16px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Pour toute modification de dernière minute, appelez-nous au
      <a href="tel:${escapeHtml(input.contactPhone.replace(/\s+/g, ""))}" style="color: ${COLORS.violet700};">${escapeHtml(input.contactPhone)}</a>.
    </p>
  `;

  const html = emailLayout({
    title: "À demain !",
    subtitle: `${dateFr} · ${input.startTime}`,
    contentHtml,
    preheader: `Rappel de votre RDV de demain à ${input.startTime}`,
  });

  return { subject, html, text };
}
