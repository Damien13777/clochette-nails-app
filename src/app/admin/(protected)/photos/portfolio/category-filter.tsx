"use client";

/**
 * Chips de filtre catégorie pour le portfolio.
 * Navigation via Next Link (sync server side).
 */

import Link from "next/link";
import type { ServiceCategory } from "@prisma/client";

type Props = {
  active: ServiceCategory | null;
  counts: Record<ServiceCategory | "all", number>;
  categoryKeys: ServiceCategory[];
  labels: Record<ServiceCategory, string>;
};

export function CategoryFilter({ active, counts, categoryKeys, labels }: Props) {
  return (
    <nav
      role="tablist"
      aria-label="Filtrer par catégorie"
      className="flex flex-wrap gap-2"
    >
      <Chip
        label="Toutes"
        count={counts.all}
        active={active === null}
        href="/admin/photos/portfolio"
      />
      {categoryKeys.map((cat) => (
        <Chip
          key={cat}
          label={labels[cat]}
          count={counts[cat] ?? 0}
          active={active === cat}
          href={`/admin/photos/portfolio?cat=${cat}`}
        />
      ))}
    </nav>
  );
}

function Chip({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] ${
          active
            ? "bg-white/20 text-white"
            : "bg-[var(--color-paper)] text-[var(--color-ink-500)]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
