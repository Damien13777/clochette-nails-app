"use client";

/**
 * Grid des photos portfolio.
 * Click sur une photo : ouvre PortfolioEditDialog.
 */

import { useState } from "react";
import type { PhotoMood, Season, ServiceCategory } from "@prisma/client";
import { PortfolioEditDialog } from "./edit-dialog";

export type PortfolioPhoto = {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  category: ServiceCategory;
  season: Season | null;
  mood: PhotoMood | null;
  occasion: string | null;
  tags: string[];
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  displayOrder: number;
  createdAt: Date;
};

export function PortfolioGrid({ photos }: { photos: PortfolioPhoto[] }) {
  const [editing, setEditing] = useState<PortfolioPhoto | null>(null);

  if (photos.length === 0) {
    return (
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-12 text-center">
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune photo pour ce filtre. Téléversez vos premières réalisations.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {photos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setEditing(p)}
              className="group block w-full text-left bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-hidden hover:border-[var(--color-violet-300)] hover:shadow-[var(--shadow-md)] transition-all"
            >
              <div className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.alt}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {(p.season || p.mood) && (
                  <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                    {p.season && (
                      <Pill>{seasonLabel(p.season)}</Pill>
                    )}
                    {p.mood && (
                      <Pill>{moodLabel(p.mood)}</Pill>
                    )}
                  </div>
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
              </div>
              <div className="px-2.5 py-2">
                <p
                  className="text-[11px] truncate"
                  style={{ fontFamily: "var(--font-ui)" }}
                  title={p.alt}
                >
                  {p.alt}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <PortfolioEditDialog
          photo={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-full bg-black/55 text-white text-[9px] uppercase tracking-[0.1em]"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </span>
  );
}

function seasonLabel(s: Season): string {
  return {
    PRINTEMPS: "Printemps",
    ETE: "Été",
    AUTOMNE: "Automne",
    HIVER: "Hiver",
    TOUTE_ANNEE: "Toute l'année",
  }[s];
}

function moodLabel(m: PhotoMood): string {
  return {
    ELEGANT: "Élégant",
    FESTIF: "Festif",
    NATUREL: "Naturel",
    AUDACIEUX: "Audacieux",
    MINIMALISTE: "Minimaliste",
    ROMANTIQUE: "Romantique",
    TENDANCE: "Tendance",
  }[m];
}
