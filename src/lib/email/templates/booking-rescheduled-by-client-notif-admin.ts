/**
 * Email envoyé à l'admin lorsque la cliente déplace elle-même son RDV
 * via le lien sécurisé dans son email de confirmation.
 *
 * Complète la Notification in-app (cloche).
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingRescheduledByClientNotifAdminInput = {
  bookingId: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  serviceTitle: string;
  /** Ancien créneau */
  oldDate: Date;
  oldStartTime: string;
  oldEndTime: string;
  /** Nouveau créneau */
  newDate: Date;
  newStartTime: string;
  newEndTime: string;
  /** Motif communiqué par la cliente (optionnel) */
  clientReason?: string | null;
  /** Heures restantes avant le RDV initial */
  hoursBeforeOldAppointment: number;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildBookingRescheduledByClientNotifAdminEmail(
  input: BookingRescheduledByClientNotifAdminInput,
) {
  const oldDateFr = formatDateFr(input.oldDate);
  const newDateFr = formatDateFr(input.newDate);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
  const fullName = `${input.clientFirstName} ${input.clientLastName}`.trim();

  const subject = `🔄 RDV déplacé par la cliente · ${fullName} · ${newDateFr}`;

  const text = [
    `La cliente a déplacé son rendez-vous via le lien sécurisé.`,
    ``,
    `Cliente : ${fullName}`,
    `Email   : ${input.clientEmail}`,
    `Tél     : ${input.clientPhone}`,
    ``,
    `Prestation : ${input.serviceTitle}`,
    ``,
    `Ancien créneau : ${oldDateFr} · ${input.oldStartTime} – ${input.oldEndTime}`,
    `Nouveau créneau : ${newDateFr} · ${input.newStartTime} – ${input.newEndTime}`,
    ``,
    `Déplacement effectué ${Math.round(input.hoursBeforeOldAppointment)}h avant l'ancien créneau.`,
    `Acompte conservé sur le nouveau créneau.`,
    input.clientReason ? `` : "",
    input.clientReason ? `Motif communiqué par la cliente :` : "",
    input.clientReason ? input.clientReason : "",
    ``,
    `Voir la réservation : ${siteUrl}/admin/bookings/${input.bookingId}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const contentHtml = `
    <p style="margin:0 0 20px 0;font-size:16px;color:${COLORS.ink900};">
      Une cliente vient de déplacer son rendez-vous via le lien sécurisé de son email de confirmation.
    </p>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          Cliente
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Nom</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(fullName)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Email</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="mailto:${escapeHtml(input.clientEmail)}" style="color:${COLORS.violet700};">${escapeHtml(input.clientEmail)}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Téléphone</td>
        <td style="padding:6px 0;color:${COLORS.ink900};"><a href="tel:${escapeHtml(input.clientPhone)}" style="color:${COLORS.violet700};">${escapeHtml(input.clientPhone)}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Prestation</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.serviceTitle)}</td>
      </tr>
    </table>

    <!-- Ancien créneau -->
    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:14px 16px;margin:0 0 10px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
        Ancien créneau
      </p>
      <p style="margin:0;font-size:14px;color:${COLORS.ink500};text-transform:capitalize;text-decoration:line-through;text-decoration-color:${COLORS.ink300};">
        ${escapeHtml(oldDateFr)} · ${escapeHtml(input.oldStartTime)} – ${escapeHtml(input.oldEndTime)}
      </p>
    </div>

    <div style="text-align:center;margin:0 0 10px 0;">
      <span style="display:inline-block;width:28px;height:28px;line-height:28px;background-color:${COLORS.violet600};color:#fff;border-radius:50%;font-size:16px;font-weight:600;">↓</span>
    </div>

    <!-- Nouveau créneau -->
    <div style="background-color:${COLORS.violet50};border:2px solid ${COLORS.violet600};border-radius:8px;padding:16px;margin:0 0 20px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.violet700};font-weight:500;">
        Nouveau créneau
      </p>
      <p style="margin:0 0 4px 0;font-size:17px;color:${COLORS.ink900};font-weight:500;text-transform:capitalize;">
        ${escapeHtml(newDateFr)}
      </p>
      <p style="margin:0;font-size:15px;color:${COLORS.ink900};">
        ${escapeHtml(input.newStartTime)} – ${escapeHtml(input.newEndTime)}
      </p>
    </div>

    ${
      input.clientReason
        ? `<div style="background-color:#fff5f0;border-left:3px solid #c87850;padding:12px 16px;border-radius:4px;margin:0 0 20px 0;">
            <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
              Motif communiqué par la cliente
            </p>
            <p style="margin:0;font-size:14px;color:${COLORS.ink700};white-space:pre-wrap;">
              ${escapeHtml(input.clientReason)}
            </p>
          </div>`
        : ""
    }

    <div style="background-color:#f0f9f4;border-left:3px solid #2d8659;padding:12px 16px;border-radius:4px;margin:0 0 20px 0;">
      <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
        <strong style="color:#1d6b48;">Acompte conservé</strong> sur le nouveau créneau —
        aucune action requise. Déplacement effectué <strong>${Math.round(input.hoursBeforeOldAppointment)}h</strong> avant l'ancien créneau.
      </p>
    </div>

    <div style="text-align:center;margin:24px 0 0 0;">
      <a href="${siteUrl}/admin/bookings/${escapeHtml(input.bookingId)}" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Voir la réservation
      </a>
    </div>
  `;

  const html = emailLayout({
    title: "Déplacement par la cliente",
    subtitle: `${fullName} · ${newDateFr}`,
    contentHtml,
    preheader: `${fullName} a déplacé son RDV au ${newDateFr} à ${input.newStartTime}.`,
  });

  return { subject, html, text };
}
