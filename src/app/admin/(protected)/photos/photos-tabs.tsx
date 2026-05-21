"use client";

/**
 * Onglets de navigation /admin/photos.
 *
 * Client Component pour pouvoir lire le pathname et afficher l'onglet actif.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/photos/site", label: "Site (hero, à propos)" },
  { href: "/admin/photos/prestations", label: "Prestations" },
  { href: "/admin/photos/portfolio", label: "Portfolio" },
];

export function PhotosTabs() {
  const pathname = usePathname();

  return (
    <nav
      role="tablist"
      aria-label="Sections médiathèque"
      className="flex flex-wrap gap-2 border-b border-[var(--color-line)] pb-0"
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={`relative inline-flex items-center px-5 py-3 text-xs uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
              active
                ? "text-[var(--color-violet-700)]"
                : "text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[var(--color-violet-600)] rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
