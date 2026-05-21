/**
 * Email envoyé à la cliente quand son RDV est déplacé (côté admin OU cliente).
 *
 * Doit clairement afficher l'ancien créneau ET le nouveau, avec un visuel
 * "avant / après" pour qu'aucune confusion ne soit possible.
 *
 * Pas de remboursement : même prestation, même prix, juste un nouveau créneau.
 * L'acompte versé reste valable sur le nouveau RDV.
 *
 * Le wording est neutre ("a été déplacé") donc utilisable dans les 2 sens.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingRescheduledInput = {
  clientFirstName: string;
  serviceTitle: string;
  /** Ancien créneau */
  oldDate: Date;
  oldStartTime: string;
  oldEndTime: string;
  /** Nouveau créneau */
  newDate: Date;
  newStartTime: string;
  newEndTime: string;
  /** Raison transmise à la cliente (optionnelle) */
  reason?: string | null;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildBookingRescheduledEmail(input: BookingRescheduledInput) {
  const oldDateFr = formatDateFr(input.oldDate);
  const newDateFr = formatDateFr(input.newDate);

  const subject = `Votre RDV a été déplacé au ${newDateFr}`;

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Votre rendez-vous chez Clochette Nails a été déplacé.`,
    ``,
    `Ancien créneau :`,
    `→ ${oldDateFr}`,
    `→ ${input.oldStartTime} – ${input.oldEndTime}`,
    ``,
    `Nouveau créneau :`,
    `→ ${newDateFr}`,
    `→ ${input.newStartTime} – ${input.newEndTime}`,
    ``,
    `Prestation : ${input.serviceTitle}`,
    input.reason ? `Motif : ${input.reason}` : "",
    ``,
    `Votre acompte est conservé et reste valable sur ce nouveau créneau.`,
    `Si ce nouveau créneau ne vous convient pas, contactez-nous directement :`,
    `Téléphone : {{contactPhone}}`,
    `Email     : {{contactEmail}}`,
    ``,
    `À très bientôt !`,
    `Clochette Nails`,
  ]
    .filter(Boolean)
    .join("\n");

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.ink900};">
      Bonjour <strong>${escapeHtml(input.clientFirstName)}</strong>,
    </p>
    <p style="margin:0 0 24px 0;">
      Votre rendez-vous chez <strong>Clochette Nails</strong> a été déplacé.
      Voici le récapitulatif du changement :
    </p>

    <!-- Ancien créneau -->
    <div style="background-color:${COLORS.cream};border:1px solid ${COLORS.line};border-radius:8px;padding:16px;margin:0 0 12px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
        Ancien créneau
      </p>
      <p style="margin:0;font-size:15px;color:${COLORS.ink500};text-transform:capitalize;text-decoration:line-through;text-decoration-color:${COLORS.ink300};">
        ${escapeHtml(oldDateFr)} · ${escapeHtml(input.oldStartTime)} – ${escapeHtml(input.oldEndTime)}
      </p>
    </div>

    <!-- Flèche transition -->
    <div style="text-align:center;margin:0 0 12px 0;">
      <span style="display:inline-block;width:32px;height:32px;line-height:32px;background-color:${COLORS.violet600};color:#fff;border-radius:50%;font-size:18px;font-weight:600;">↓</span>
    </div>

    <!-- Nouveau créneau -->
    <div style="background-color:${COLORS.violet50};border:2px solid ${COLORS.violet600};border-radius:8px;padding:20px;margin:0 0 24px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.violet700};font-weight:500;">
        Nouveau créneau
      </p>
      <p style="margin:0 0 8px 0;font-size:19px;color:${COLORS.ink900};font-weight:500;text-transform:capitalize;">
        ${escapeHtml(newDateFr)}
      </p>
      <p style="margin:0 0 12px 0;font-size:16px;color:${COLORS.ink900};">
        ${escapeHtml(input.newStartTime)} – ${escapeHtml(input.newEndTime)}
      </p>
      <p style="margin:0;font-size:14px;color:${COLORS.ink700};border-top:1px solid ${COLORS.violet600}33;padding-top:10px;">
        ${escapeHtml(input.serviceTitle)}
      </p>
    </div>

    ${
      input.reason
        ? `<div style="background-color:#fff5f0;border-left:3px solid #c87850;padding:12px 16px;border-radius:4px;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
              Motif du changement
            </p>
            <p style="margin:0;font-size:14px;color:${COLORS.ink700};white-space:pre-wrap;">
              ${escapeHtml(input.reason)}
            </p>
          </div>`
        : ""
    }

    <div style="background-color:#f0f9f4;border-left:3px solid #2d8659;padding:12px 16px;border-radius:4px;margin:0 0 24px 0;">
      <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
        <strong style="color:#1d6b48;">Votre acompte est conservé</strong>
        et reste valable pour ce nouveau créneau. Aucune action n'est nécessaire de votre part.
      </p>
    </div>

    <p style="margin:0 0 8px 0;color:${COLORS.ink700};font-size:14px;">
      Ce nouveau créneau ne vous convient pas ? Contactez-nous directement :
    </p>
    <p style="margin:0 0 24px 0;color:${COLORS.ink700};font-size:14px;">
      📞 <a href="{{contactPhoneHref}}" style="color:${COLORS.violet700};">{{contactPhone}}</a>
      &nbsp;·&nbsp;
      ✉️ <a href="mailto:{{contactEmail}}" style="color:${COLORS.violet700};">{{contactEmail}}</a>
    </p>

    <p style="margin:0;color:${COLORS.ink700};">
      À très bientôt,<br>
      <em style="color:${COLORS.violet700};">Clochette Nails</em>
    </p>
  `;

  const html = emailLayout({
    title: "Rendez-vous déplacé",
    subtitle: `Nouveau créneau : ${newDateFr.charAt(0).toUpperCase() + newDateFr.slice(1)} à ${input.newStartTime}`,
    contentHtml,
    preheader: `Votre RDV est déplacé au ${newDateFr} à ${input.newStartTime} (ancien : ${oldDateFr} à ${input.oldStartTime}).`,
  });

  return { subject, html, text };
}
