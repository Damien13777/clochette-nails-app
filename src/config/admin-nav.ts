/**
 * Configuration de la navigation admin.
 *
 * Source de vérité unique pour la sidebar + breadcrumbs futurs.
 * Les `badgeKey` permettent au Server Component parent d'injecter
 * un compteur (ex: bookings AWAITING_DEPOSIT, contacts non lus).
 */

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  badgeKey?: "bookings" | "giftCards" | "contacts";
};

export type AdminNavGroup = {
  label: string;
  items: readonly AdminNavItem[];
};

export type AdminIconName =
  | "dashboard"
  | "calendar"
  | "calendar-check"
  | "sparkles"
  | "image"
  | "gift"
  | "book"
  | "newspaper"
  | "mail-plus"
  | "message"
  | "wallet"
  | "settings"
  | "scroll"
  | "zap";

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/admin", label: "Tableau de bord", icon: "dashboard" },
      { href: "/admin/calendrier", label: "Calendrier", icon: "calendar" },
      {
        href: "/admin/bookings",
        label: "Bookings",
        icon: "calendar-check",
        badgeKey: "bookings",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/prestations", label: "Prestations", icon: "sparkles" },
      { href: "/admin/photos", label: "Photos", icon: "image" },
      {
        href: "/admin/cartes-cadeau",
        label: "Cartes cadeau",
        icon: "gift",
        badgeKey: "giftCards",
      },
      { href: "/admin/ebooks", label: "Ebooks", icon: "book" },
    ],
  },
  {
    label: "Contenu",
    items: [
      { href: "/admin/blog", label: "Blog", icon: "newspaper" },
      { href: "/admin/newsletter", label: "Newsletter", icon: "mail-plus" },
      {
        href: "/admin/contacts",
        label: "Contacts",
        icon: "message",
        badgeKey: "contacts",
      },
    ],
  },
  {
    label: "Système",
    items: [
      { href: "/admin/finances", label: "Finances", icon: "wallet" },
      { href: "/admin/webhooks", label: "Webhooks", icon: "zap" },
      { href: "/admin/parametres", label: "Paramètres", icon: "settings" },
      { href: "/admin/logs", label: "Logs", icon: "scroll" },
    ],
  },
] as const;
