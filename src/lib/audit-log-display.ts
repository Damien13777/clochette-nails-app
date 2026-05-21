/**
 * Mapping action audit → label FR + domaine + ton visuel.
 *
 * Le champ AuditLog.action est un string libre (cf. schema.prisma).
 * Ce helper le traduit pour l'affichage admin (page /admin/logs) et
 * regroupe par domaine pour les filtres.
 */

export type AuditDomain =
  | "booking"
  | "gift_card"
  | "contact"
  | "calendar"
  | "platform"
  | "uploads"
  | "other";

export type AuditTone = "neutral" | "success" | "warning" | "danger";

export type ActionMeta = {
  label: string;
  domain: AuditDomain;
  tone: AuditTone;
};

const ACTION_MAP: Record<string, ActionMeta> = {
  // ── Bookings ─────────────────────────────────────────────
  "booking.created": { label: "RDV créé", domain: "booking", tone: "neutral" },
  "booking.confirmed": {
    label: "RDV confirmé (paiement reçu)",
    domain: "booking",
    tone: "success",
  },
  "booking.confirmation": {
    label: "RDV confirmé",
    domain: "booking",
    tone: "success",
  },
  "booking.completed": {
    label: "RDV honoré",
    domain: "booking",
    tone: "success",
  },
  "booking.no_show": {
    label: "RDV no-show",
    domain: "booking",
    tone: "warning",
  },
  "booking.cancelled_admin": {
    label: "RDV annulé (admin)",
    domain: "booking",
    tone: "warning",
  },
  "booking.refunded_full": {
    label: "RDV remboursé",
    domain: "booking",
    tone: "warning",
  },
  "booking.force_confirmed": {
    label: "RDV confirmé manuellement",
    domain: "booking",
    tone: "neutral",
  },
  "booking.rescheduled_admin": {
    label: "RDV déplacé (admin)",
    domain: "booking",
    tone: "neutral",
  },
  "booking.revenue_updated": {
    label: "Montant perçu modifié",
    domain: "booking",
    tone: "neutral",
  },
  "booking.created_by_admin_no_deposit": {
    label: "RDV admin créé (sans acompte)",
    domain: "booking",
    tone: "neutral",
  },
  "booking.created_by_admin_paid_in_person": {
    label: "RDV admin créé (paiement physique)",
    domain: "booking",
    tone: "neutral",
  },
  "booking.created_by_admin_send_link": {
    label: "RDV admin créé (lien paiement)",
    domain: "booking",
    tone: "neutral",
  },

  // ── Gift cards ───────────────────────────────────────────
  "gift_card.created_admin": {
    label: "Carte cadeau émise",
    domain: "gift_card",
    tone: "success",
  },
  "gift_card.cancelled": {
    label: "Carte cadeau annulée",
    domain: "gift_card",
    tone: "warning",
  },
  "gift_card.expiration_extended": {
    label: "Validité carte prolongée",
    domain: "gift_card",
    tone: "neutral",
  },
  "gift_card.refunded_stripe": {
    label: "Carte cadeau remboursée (Stripe)",
    domain: "gift_card",
    tone: "warning",
  },
  "gift_card.email_resent": {
    label: "Email carte cadeau renvoyé",
    domain: "gift_card",
    tone: "neutral",
  },

  // ── Contacts ─────────────────────────────────────────────
  "contact.read": {
    label: "Message lu",
    domain: "contact",
    tone: "neutral",
  },
  "contact.marked_unread": {
    label: "Message remis en non lu",
    domain: "contact",
    tone: "neutral",
  },
  "contact.replied": {
    label: "Message marqué répondu",
    domain: "contact",
    tone: "success",
  },
  "contact.archived": {
    label: "Message archivé",
    domain: "contact",
    tone: "neutral",
  },
  "contact.unarchived": {
    label: "Message désarchivé",
    domain: "contact",
    tone: "neutral",
  },
  "contact.deleted": {
    label: "Message supprimé",
    domain: "contact",
    tone: "danger",
  },

  // ── Calendar (réglages) ──────────────────────────────────
  "calendar.business_hours_updated": {
    label: "Horaires d'ouverture modifiés",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.day_exception_upserted": {
    label: "Exception journée définie",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.day_exception_deleted": {
    label: "Exception journée supprimée",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.unavailability_created": {
    label: "Indispo créée",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.unavailability_updated": {
    label: "Indispo modifiée",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.unavailability_deleted": {
    label: "Indispo supprimée",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.recurring_unavailability_created": {
    label: "Indispo récurrente créée",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.recurring_unavailability_deleted": {
    label: "Indispo récurrente supprimée",
    domain: "calendar",
    tone: "neutral",
  },
  "calendar.bookable_month_opened": {
    label: "Mois ouvert à la réservation",
    domain: "calendar",
    tone: "success",
  },
  "calendar.bookable_month_closed": {
    label: "Mois fermé à la réservation",
    domain: "calendar",
    tone: "warning",
  },

  // ── Platform / system ────────────────────────────────────
  "platform.settings_updated": {
    label: "Paramètres plateforme mis à jour",
    domain: "platform",
    tone: "neutral",
  },
  "uploads.cleaned": {
    label: "Nettoyage photos automatique",
    domain: "uploads",
    tone: "neutral",
  },
};

/** Retourne le meta d'une action, fallback "Action inconnue" si non mappée. */
export function actionMeta(action: string): ActionMeta {
  const meta = ACTION_MAP[action];
  if (meta) return meta;
  // Fallback : extraire le domaine du préfixe, label = action brute
  const domain = action.split(".")[0] as AuditDomain;
  return {
    label: action,
    domain: isKnownDomain(domain) ? domain : "other",
    tone: "neutral",
  };
}

function isKnownDomain(d: string): d is AuditDomain {
  return [
    "booking",
    "gift_card",
    "contact",
    "calendar",
    "platform",
    "uploads",
    "other",
  ].includes(d);
}

export const DOMAIN_LABELS: Record<AuditDomain, string> = {
  booking: "Réservations",
  gift_card: "Cartes cadeau",
  contact: "Contacts",
  calendar: "Calendrier",
  platform: "Paramètres",
  uploads: "Uploads",
  other: "Autre",
};

export const ALL_DOMAINS: AuditDomain[] = [
  "booking",
  "gift_card",
  "contact",
  "calendar",
  "platform",
  "uploads",
  "other",
];

/** Normalise une chaîne pour comparaison accent-insensible. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase();
}

/**
 * Retourne les action keys dont le label FR contient (accent-insensible) la
 * recherche. Permet de chercher "annulé" et trouver booking.cancelled_admin,
 * gift_card.cancelled, contact.deleted etc.
 *
 * Retourne null si query est vide.
 */
export function actionKeysMatchingLabel(query: string): string[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const matches: string[] = [];
  for (const [key, meta] of Object.entries(ACTION_MAP)) {
    if (normalize(meta.label).includes(q)) {
      matches.push(key);
    }
  }
  return matches;
}

/** Tente d'extraire un résumé court depuis le metadata JSON. */
export function summarizeMetadata(
  metadata: unknown,
): { id?: string; entity?: string; extra?: string } {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;

  if (typeof m.bookingId === "string")
    return { id: m.bookingId, entity: "booking" };
  if (typeof m.giftCardId === "string")
    return { id: m.giftCardId, entity: "gift_card" };
  if (typeof m.contactId === "string")
    return { id: m.contactId, entity: "contact" };
  return {};
}
