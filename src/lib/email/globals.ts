/**
 * Globals partagés par tous les emails transactionnels.
 *
 * Lus depuis PlatformSettings (champs éditables via /admin/parametres),
 * avec fallback sur valeurs codées en dur si la DB est indisponible
 * (ex: build time, ou première migration).
 *
 * Utilisation côté template :
 *   const globals = await loadEmailGlobals();
 *   ...${globals.signature}...
 *
 * Utilisation côté caller (le plus fréquent) :
 *   const globals = await loadEmailGlobals();
 *   const mail = buildXxxEmail({ ...input, globals });
 *
 * Cache : `React.cache` mémorise le résultat dans la même request.
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type EmailGlobals = {
  /** Email de contact du salon (mailto). */
  contactEmail: string;
  /** Téléphone affiché (ex: "06 88 68 66 99"). */
  contactPhone: string;
  /** Téléphone format href tel: (ex: "tel:0688686699"). */
  contactPhoneHref: string;
  /** Signature ("Chloé — Clochette Nails"). */
  signature: string;
  /** Adresse salon affichée dans le footer. */
  salonAddress: string | null;
  /** Mention temporaire affichée en footer (vacances, promo…). Vide si null. */
  footerNote: string | null;
  /** URL absolue d'une bannière image en haut de chaque email. */
  headerImageUrl: string | null;
  /** Largeur d'affichage de la bannière header (px). */
  headerImageWidth: number | null;
  /** Idem mais en bas. */
  footerImageUrl: string | null;
  footerImageWidth: number | null;
};

const DEFAULTS: EmailGlobals = {
  contactEmail: "contact@clochette-nails.fr",
  contactPhone: "06 88 68 66 99",
  contactPhoneHref: "tel:0688686699",
  signature: "Chloé — Clochette Nails",
  salonAddress: null,
  footerNote: null,
  headerImageUrl: null,
  headerImageWidth: null,
  footerImageUrl: null,
  footerImageWidth: null,
};

/** Convertit un numéro affiché en href tel: (strip non-digits). */
function phoneToHref(phone: string | null | undefined): string {
  if (!phone) return DEFAULTS.contactPhoneHref;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? `tel:${digits}` : DEFAULTS.contactPhoneHref;
}

export const loadEmailGlobals = cache(async (): Promise<EmailGlobals> => {
  try {
    const settings = await prisma.platformSettings.findFirst({
      select: {
        contactEmail: true,
        contactPhone: true,
        businessAddress: true,
        emailSignature: true,
        emailFooterNote: true,
        emailHeaderImageUrl: true,
        emailHeaderImageWidth: true,
        emailFooterImageUrl: true,
        emailFooterImageWidth: true,
      },
    });
    if (!settings) return DEFAULTS;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
    const toAbs = (u: string | null) =>
      u ? (u.startsWith("http") ? u : `${siteUrl}${u}`) : null;
    return {
      contactEmail: settings.contactEmail || DEFAULTS.contactEmail,
      contactPhone: settings.contactPhone || DEFAULTS.contactPhone,
      contactPhoneHref: phoneToHref(settings.contactPhone),
      signature: settings.emailSignature || DEFAULTS.signature,
      salonAddress: settings.businessAddress || null,
      footerNote: settings.emailFooterNote || null,
      headerImageUrl: toAbs(settings.emailHeaderImageUrl),
      headerImageWidth: settings.emailHeaderImageWidth,
      footerImageUrl: toAbs(settings.emailFooterImageUrl),
      footerImageWidth: settings.emailFooterImageWidth,
    };
  } catch (err) {
    console.error("[loadEmailGlobals] DB error, falling back:", err);
    return DEFAULTS;
  }
});
