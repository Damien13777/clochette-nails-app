/**
 * Helpers d'affichage pour les bookings (utilisés sur la liste + détail admin).
 * Server-safe (pas de "use client"), réutilisable en RSC et Client.
 */

import type { BookingStatus } from "@prisma/client";

export type StatusVisual = {
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
};

export const STATUS_VISUAL: Record<BookingStatus, StatusVisual> = {
  AWAITING_DEPOSIT: {
    label: "Acompte en attente",
    bgClass: "bg-[var(--color-warning)]/12",
    textClass: "text-[var(--color-warning)]",
    dotClass: "bg-[var(--color-warning)]",
  },
  CONFIRMED: {
    label: "Confirmée",
    bgClass: "bg-[var(--color-success)]/12",
    textClass: "text-[var(--color-success)]",
    dotClass: "bg-[var(--color-success)]",
  },
  COMPLETED: {
    label: "Honorée",
    bgClass: "bg-[var(--color-violet-100)]",
    textClass: "text-[var(--color-violet-700)]",
    dotClass: "bg-[var(--color-violet-600)]",
  },
  CANCELLED_BY_CLIENT: {
    label: "Annulée (client)",
    bgClass: "bg-[var(--color-bone)]",
    textClass: "text-[var(--color-ink-500)]",
    dotClass: "bg-[var(--color-ink-500)]",
  },
  CANCELLED_BY_ADMIN: {
    label: "Annulée (admin)",
    bgClass: "bg-[var(--color-bone)]",
    textClass: "text-[var(--color-ink-500)]",
    dotClass: "bg-[var(--color-ink-500)]",
  },
  NO_SHOW: {
    label: "Absente",
    bgClass: "bg-[var(--color-danger)]/12",
    textClass: "text-[var(--color-danger)]",
    dotClass: "bg-[var(--color-danger)]",
  },
  EXPIRED: {
    label: "Expirée",
    bgClass: "bg-[var(--color-bone)]",
    textClass: "text-[var(--color-ink-500)]",
    dotClass: "bg-[var(--color-ink-500)]",
  },
};

export function formatBookingDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatBookingDateShort(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

/**
 * Prix public « à partir de » (centimes → "À partir de 45 €"). Sans décimales
 * si le montant est un nombre d'euros entier, sinon 2 décimales. Le « à partir
 * de » reflète que les options ajoutées font monter le total.
 */
export function formatPriceFrom(cents: number): string {
  if (cents <= 0) return "Sur devis";
  const euros =
    cents % 100 === 0
      ? String(cents / 100)
      : (cents / 100).toFixed(2).replace(".", ",");
  return `À partir de ${euros} €`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}
