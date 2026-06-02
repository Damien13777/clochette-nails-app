"use client";

/**
 * Bouton "Retour" admin — revient à la page précédente comme le bouton
 * précédent du navigateur, en restituant l'URL exacte d'origine (semaine du
 * calendrier, filtre/pagination d'une liste, etc.). Si la page a été ouverte
 * sans historique applicatif (nouvel onglet, lien profond, rafraîchissement),
 * il bascule sur `fallbackHref`.
 */

import { useRouter } from "next/navigation";

type Props = {
  fallbackHref: string;
  label?: string;
  className?: string;
};

const DEFAULT_CLASS =
  "inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] mb-4 transition-colors cursor-pointer";

export function BackButton({ fallbackHref, label = "Retour", className }: Props) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className ?? DEFAULT_CLASS}
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      {label}
    </button>
  );
}
