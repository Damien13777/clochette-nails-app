"use client";

/**
 * Barre de chips de filtre par catégorie, partagée par le teaser landing
 * et la page /realisations. Scroll horizontal sur mobile, centrée desktop.
 */
import type { ServiceCategory } from "@prisma/client";
import type { PortfolioCategory } from "./types";

type Props = {
  categories: PortfolioCategory[];
  active: ServiceCategory | "all";
  onChange: (value: ServiceCategory | "all") => void;
};

export function FilterChips({ categories, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filtres portfolio"
      className="flex gap-2 mb-10 overflow-x-auto md:justify-center pb-2 -mx-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Chip label="Tous" active={active === "all"} onClick={() => onChange("all")} />
      {categories.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.label}
          active={active === cat.id}
          onClick={() => onChange(cat.id)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 px-4 py-2 text-xs uppercase tracking-[0.06em] rounded-full transition-all ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] hover:text-[var(--color-violet-700)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </button>
  );
}
