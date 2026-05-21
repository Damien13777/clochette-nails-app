"use client";

/**
 * Sous-nav d'onglets pour la section /admin/newsletter (Abonnées / Campagnes).
 */

import Link from "next/link";

type Props = { current: "abonnes" | "campagnes" };

const ITEMS = [
  { key: "abonnes", label: "Abonnées", href: "/admin/newsletter" },
  { key: "campagnes", label: "Campagnes", href: "/admin/newsletter/campagnes" },
] as const;

export function NewsletterTabs({ current }: Props) {
  return (
    <nav
      role="tablist"
      aria-label="Sections newsletter"
      className="flex flex-wrap gap-2 mb-6"
    >
      {ITEMS.map((t) => {
        const isActive = current === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
              isActive
                ? "bg-[var(--color-violet-600)] text-white"
                : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
