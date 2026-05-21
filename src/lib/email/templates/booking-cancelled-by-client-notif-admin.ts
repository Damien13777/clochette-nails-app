/**
 * Email envoyé à l'admin lorsque la cliente annule elle-même son RDV
 * via le lien sécurisé dans son mail de confirmation.
 *
 * Complète la Notification in-app (cloche) pour les cas où Chloé ne se
 * connecte pas régulièrement à l'admin.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingCancelledByClientNotifAdminInput = {
  bookingId: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  serviceTitle: string;
  date: Date;
  startTime: string;
  endTime: string;
  /** Montant total remboursé en centimes (Stripe + GC). 0 si pas de refund. */
  refundedCents: number;
  /** Portion remboursée via Stripe. */
  stripeRefundedCents?: number;
  /** Portion re-créditée sur la carte cadeau. */
  giftCardRefundedCents?: number;
  /** Prefix de la carte cadeau re-créditée. */
  giftCardPrefix?: string | null;
  /** Heures restantes avant le RDV au moment de l'annulation */
  hoursBeforeAppointment: number;
  /**
   * Mode de paiement initial du booking — détermine le bloc affiché :
   *  - "stripe" + refundedCents>0 → bloc vert "Remboursement"
   *  - "stripe" + refundedCents=0 → bloc orange "Acompte conservé (<72h)"
   *  - "cash" | "transfer" | "check" | "card_terminal" | "gift_card_full"
   *    → bloc orange "Acompte conservé (paiement physique)"
   *  - "none" → bloc neutre "Aucun acompte n'avait été demandé"
   */
  paymentMethod?: string | null;
};

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function buildBookingCancelledByClientNotifAdminEmail(
  input: BookingCancelledByClientNotifAdminInput,
) {
  const dateFr = formatDateFr(input.date);
  const refundFr = formatCents(input.refundedCents);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
  const fullName = `${input.clientFirstName} ${input.clientLastName}`.trim();

  const stripePart = input.stripeRefundedCents ?? 0;
  const gcPart = input.giftCardRefundedCents ?? 0;
  const gcPrefix = input.giftCardPrefix ?? null;
  const totalRefund = input.refundedCents;

  // Détermine le contexte du paiement pour adapter le bloc affiché
  type Variant =
    | "refunded-stripe"
    | "refunded-gc"
    | "refunded-mixed"
    | "kept-too-late"
    | "kept-in-person"
    | "no-deposit";

  const variant: Variant = (() => {
    if (totalRefund > 0) {
      if (stripePart > 0 && gcPart > 0) return "refunded-mixed";
      if (gcPart > 0) return "refunded-gc";
      return "refunded-stripe";
    }
    if (input.paymentMethod === "none") return "no-deposit";
    if (input.paymentMethod && input.paymentMethod !== "stripe")
      return "kept-in-person";
    return "kept-too-late";
  })();

  const subjectByVariant: Record<Variant, string> = {
    "refunded-stripe": `❌ Annulation cliente · ${fullName} · ${dateFr}`,
    "refunded-gc": `❌ Annulation cliente (re-crédit carte cadeau) · ${fullName} · ${dateFr}`,
    "refunded-mixed": `❌ Annulation cliente (remboursement mixte) · ${fullName} · ${dateFr}`,
    "kept-too-late": `❌ Annulation cliente (< 72h, acompte conservé) · ${fullName} · ${dateFr}`,
    "kept-in-person": `❌ Annulation cliente (paiement physique, acompte conservé) · ${fullName} · ${dateFr}`,
    "no-deposit": `❌ Annulation cliente (RDV sans acompte) · ${fullName} · ${dateFr}`,
  };
  const subject = subjectByVariant[variant];

  const paymentLineText: Record<Variant, string> = {
    "refunded-stripe": `Remboursement Stripe : ${refundFr} (3-5j ouvrés sur la CB de la cliente).`,
    "refunded-gc": `Carte cadeau ${gcPrefix ? `••${gcPrefix} ` : ""}re-créditée de ${formatCents(gcPart)} (immédiatement disponible).`,
    "refunded-mixed": `Remboursement mixte : ${formatCents(stripePart)} Stripe + ${formatCents(gcPart)} re-crédité sur carte cadeau${gcPrefix ? ` ••${gcPrefix}` : ""}.`,
    "kept-too-late": `Acompte conservé selon CGV §11 (annulation < 72h, aucun remboursement).`,
    "kept-in-person": `Acompte conservé selon CGV §11 — paiement initial réglé au salon (non remboursable automatiquement).`,
    "no-deposit": `Aucun acompte n'avait été demandé pour ce RDV (créé sans acompte). Aucune action de remboursement nécessaire.`,
  };

  const text = [
    `La cliente a annulé son rendez-vous via le lien dans son email de confirmation.`,
    ``,
    `Cliente : ${fullName}`,
    `Email   : ${input.clientEmail}`,
    `Tél     : ${input.clientPhone}`,
    ``,
    `Prestation : ${input.serviceTitle}`,
    `Date       : ${dateFr}`,
    `Horaire    : ${input.startTime} – ${input.endTime}`,
    ``,
    `Annulation effectuée ${Math.round(input.hoursBeforeAppointment)}h avant le RDV.`,
    paymentLineText[variant],
    ``,
    `Voir la réservation : ${siteUrl}/admin/bookings/${input.bookingId}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin:0 0 20px 0;font-size:16px;color:${COLORS.ink900};">
      Une cliente vient d'annuler son rendez-vous via le lien sécurisé de son email de confirmation.
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
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-top:1px solid ${COLORS.line};padding-top:16px;">
      <tr>
        <td colspan="2" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.ink500};">
          RDV annulé
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};width:140px;">Prestation</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.serviceTitle)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Date</td>
        <td style="padding:6px 0;color:${COLORS.ink900};text-transform:capitalize;">${escapeHtml(dateFr)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.ink700};">Horaire</td>
        <td style="padding:6px 0;color:${COLORS.ink900};">${escapeHtml(input.startTime)} – ${escapeHtml(input.endTime)}</td>
      </tr>
    </table>

    ${
      variant === "refunded-stripe" ||
      variant === "refunded-gc" ||
      variant === "refunded-mixed"
        ? (() => {
            const titleByVariant: Record<string, string> = {
              "refunded-stripe": "Remboursement automatique Stripe",
              "refunded-gc": `Carte cadeau re-créditée${gcPrefix ? ` ••${gcPrefix}` : ""}`,
              "refunded-mixed": "Remboursement mixte (Stripe + carte cadeau)",
            };
            const breakdown =
              variant === "refunded-mixed"
                ? `<p style="margin:6px 0;font-size:13px;color:${COLORS.ink700};">
                    <span style="display:inline-block;width:8px;height:8px;background:${COLORS.violet600};border-radius:50%;margin-right:6px;"></span>
                    ${escapeHtml(formatCents(stripePart))} via Stripe (3-5j ouvrés)<br/>
                    <span style="display:inline-block;width:8px;height:8px;background:#2d8659;border-radius:50%;margin-right:6px;"></span>
                    ${escapeHtml(formatCents(gcPart))} re-crédité sur carte cadeau${gcPrefix ? ` ••${escapeHtml(gcPrefix)}` : ""} (immédiat)
                  </p>`
                : "";
            return `<div style="background-color:#f0f9f4;border-left:3px solid #2d8659;padding:14px 16px;border-radius:4px;margin:0 0 20px 0;">
              <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
                ${escapeHtml(titleByVariant[variant])}
              </p>
              <p style="margin:0 0 4px 0;font-size:18px;color:#1d6b48;font-weight:500;">
                ${escapeHtml(refundFr)}
              </p>
              ${breakdown}
              <p style="margin:0;font-size:13px;color:${COLORS.ink700};">
                Annulation effectuée <strong>${Math.round(input.hoursBeforeAppointment)}h avant</strong> le RDV (délai CGV : 72h).
                Le créneau est à nouveau disponible à la résa.
              </p>
            </div>`;
          })()
        : variant === "kept-too-late"
          ? `<div style="background-color:#fff5f0;border-left:3px solid #c87850;padding:14px 16px;border-radius:4px;margin:0 0 20px 0;">
              <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
                Acompte conservé selon CGV §11
              </p>
              <p style="margin:0 0 4px 0;font-size:13px;color:${COLORS.ink700};">
                Annulation effectuée <strong>${Math.round(input.hoursBeforeAppointment)}h avant</strong> le RDV (délai CGV : 72h).
                Aucun remboursement n'a été effectué — l'acompte reste acquis au salon à titre d'indemnité forfaitaire.
              </p>
              <p style="margin:6px 0 0 0;font-size:13px;color:${COLORS.ink700};">
                Le créneau est à nouveau disponible à la résa.
              </p>
            </div>`
          : variant === "kept-in-person"
            ? `<div style="background-color:#fff5f0;border-left:3px solid #c87850;padding:14px 16px;border-radius:4px;margin:0 0 20px 0;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
                  Acompte conservé — paiement réglé au salon
                </p>
                <p style="margin:0 0 4px 0;font-size:13px;color:${COLORS.ink700};">
                  L'acompte avait été réglé directement au salon (paiement en main propre).
                  Aucun remboursement automatique n'est possible via Stripe — l'acompte reste acquis au salon
                  à titre d'indemnité forfaitaire (CGV §11).
                </p>
                <p style="margin:6px 0 0 0;font-size:13px;color:${COLORS.ink700};">
                  Annulation effectuée <strong>${Math.round(input.hoursBeforeAppointment)}h avant</strong> le RDV.
                  Le créneau est à nouveau disponible à la résa.
                </p>
              </div>`
            : `<div style="background-color:${COLORS.violet50};border-left:3px solid ${COLORS.violet600};padding:14px 16px;border-radius:4px;margin:0 0 20px 0;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${COLORS.ink500};">
                  RDV sans acompte
                </p>
                <p style="margin:0 0 4px 0;font-size:13px;color:${COLORS.ink700};">
                  Aucun acompte n'avait été demandé pour ce rendez-vous lors de sa création
                  (RDV créé en admin via le calendrier, mode "Sans acompte"). Aucune action
                  de remboursement n'est nécessaire.
                </p>
                <p style="margin:6px 0 0 0;font-size:13px;color:${COLORS.ink700};">
                  Annulation effectuée <strong>${Math.round(input.hoursBeforeAppointment)}h avant</strong> le RDV.
                  Le créneau est à nouveau disponible à la résa.
                </p>
              </div>`
    }

    <div style="text-align:center;margin:24px 0 0 0;">
      <a href="${siteUrl}/admin/bookings/${escapeHtml(input.bookingId)}" style="display:inline-block;padding:12px 24px;background-color:${COLORS.violet600};color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;font-weight:500;">
        Voir la réservation
      </a>
    </div>
  `;

  const titleByVariant: Record<Variant, string> = {
    "refunded-stripe": "Annulation par la cliente",
    "refunded-gc": "Annulation par la cliente (re-crédit carte cadeau)",
    "refunded-mixed": "Annulation par la cliente (remboursement mixte)",
    "kept-too-late": "Annulation par la cliente (< 72h)",
    "kept-in-person": "Annulation par la cliente (paiement physique)",
    "no-deposit": "Annulation par la cliente (RDV sans acompte)",
  };
  const preheaderByVariant: Record<Variant, string> = {
    "refunded-stripe": `${fullName} a annulé son RDV du ${dateFr} à ${input.startTime}. Remboursement ${refundFr} en cours.`,
    "refunded-gc": `${fullName} a annulé son RDV du ${dateFr} à ${input.startTime}. Carte cadeau ${gcPrefix ? `••${gcPrefix} ` : ""}re-créditée de ${formatCents(gcPart)}.`,
    "refunded-mixed": `${fullName} a annulé son RDV du ${dateFr} à ${input.startTime}. Remboursement mixte ${refundFr}.`,
    "kept-too-late": `${fullName} a annulé son RDV du ${dateFr} à ${input.startTime}. Acompte conservé (CGV §11, < 72h).`,
    "kept-in-person": `${fullName} a annulé son RDV du ${dateFr} à ${input.startTime}. Acompte conservé (paiement physique au salon).`,
    "no-deposit": `${fullName} a annulé son RDV du ${dateFr} à ${input.startTime}. Aucun acompte n'avait été demandé.`,
  };

  const html = emailLayout({
    title: titleByVariant[variant],
    subtitle: `${fullName} · ${dateFr}`,
    contentHtml,
    preheader: preheaderByVariant[variant],
  });

  return { subject, html, text };
}
