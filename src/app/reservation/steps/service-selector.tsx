"use client";

/**
 * Step 1 — Sélection de la prestation.
 *
 * Chips de catégories + grid de cards radio.
 * Aucun prix affiché (politique salon).
 */

import { useState } from "react";
import type { ServiceCategory } from "@prisma/client";
import type { ServiceLite } from "../reservation-flow";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  POSE_NATURELS: "Pose sur ongles naturels",
  RALLONGEMENT: "Rallongements",
  PACK_SPECIAL: "Packs",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

type Props = {
  services: ServiceLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
};

export function ServiceSelector({
  services,
  selectedId,
  onSelect,
  onConfirm,
}: Props) {
  const availableCategories = Array.from(
    new Set(services.map((s) => s.category)),
  );
  const [activeCategory, setActiveCategory] = useState<ServiceCategory | "all">(
    "all",
  );

  const visibleServices =
    activeCategory === "all"
      ? services
      : services.filter((s) => s.category === activeCategory);

  return (
    <div className="space-y-5 pt-4">
      {/* Chips catégorie */}
      <div
        role="tablist"
        aria-label="Catégories de prestations"
        className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5"
      >
        <CategoryChip
          label="Toutes"
          active={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
        />
        {availableCategories.map((cat) => (
          <CategoryChip
            key={cat}
            label={CATEGORY_LABELS[cat]}
            active={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
          />
        ))}
      </div>

      {/* Grid de cards */}
      <div className="grid sm:grid-cols-2 gap-3 mb-2" role="radiogroup" aria-label="Prestations">
        {visibleServices.map((svc) => {
          const isSelected = selectedId === svc.id;
          return (
            <button
              key={svc.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(svc.id)}
              className={`text-left p-4 rounded-[var(--radius-md)] border transition-all ${
                isSelected
                  ? "border-[var(--color-violet-600)] bg-[var(--color-violet-50)] shadow-[var(--shadow-focus)]"
                  : "border-[var(--color-line)] bg-[var(--color-paper)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2
                  className="text-base leading-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {svc.title}
                </h2>
                {isSelected && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-violet-600)] text-white grid place-items-center text-xs">
                    ✓
                  </span>
                )}
              </div>
              <p
                className="text-xs text-[var(--color-ink-500)] leading-relaxed line-clamp-2"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {svc.shortDesc}
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-xs text-[var(--color-ink-700)]">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {formatDuration(svc.durationMinutes)}
              </div>
              {isSelected && svc.disclaimer && (
                <p
                  role="note"
                  className="mt-2 text-[11px] leading-snug text-[var(--color-danger)] flex items-start gap-1.5"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{svc.disclaimer}</span>
                </p>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!selectedId}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Continuer
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

function CategoryChip({
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
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] hover:text-[var(--color-violet-700)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </button>
  );
}
