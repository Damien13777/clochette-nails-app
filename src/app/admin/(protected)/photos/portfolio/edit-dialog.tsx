"use client";

/**
 * Modale d'édition d'une photo portfolio.
 * Permet d'éditer : alt, caption, category, season, mood, occasion, tags.
 * + bouton supprimer (avec confirm).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PhotoMood, Season, ServiceCategory } from "@prisma/client";
import {
  deletePortfolioPhoto,
  updatePortfolioPhoto,
} from "@/lib/actions/medias";
import type { PortfolioPhoto } from "./portfolio-grid";

const CATEGORY_OPTIONS: { value: ServiceCategory; label: string }[] = [
  { value: "POSE_NATURELS", label: "Pose sur ongles naturels" },
  { value: "RALLONGEMENT", label: "Rallongements" },
  { value: "PACK_SPECIAL", label: "Packs" },
  { value: "SOIN_MAINS", label: "Soin mains" },
  { value: "SOIN_PIEDS", label: "Soin pieds" },
  { value: "DEPOSE", label: "Dépose" },
];

const SEASON_OPTIONS: { value: Season | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "PRINTEMPS", label: "Printemps" },
  { value: "ETE", label: "Été" },
  { value: "AUTOMNE", label: "Automne" },
  { value: "HIVER", label: "Hiver" },
  { value: "TOUTE_ANNEE", label: "Toute l'année" },
];

const MOOD_OPTIONS: { value: PhotoMood | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "ELEGANT", label: "Élégant" },
  { value: "FESTIF", label: "Festif" },
  { value: "NATUREL", label: "Naturel" },
  { value: "AUDACIEUX", label: "Audacieux" },
  { value: "MINIMALISTE", label: "Minimaliste" },
  { value: "ROMANTIQUE", label: "Romantique" },
  { value: "TENDANCE", label: "Tendance" },
];

type Props = {
  photo: PortfolioPhoto;
  onClose: () => void;
};

export function PortfolioEditDialog({ photo, onClose }: Props) {
  const [alt, setAlt] = useState(photo.alt);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [category, setCategory] = useState<ServiceCategory>(photo.category);
  const [season, setSeason] = useState<Season | "">(photo.season ?? "");
  const [mood, setMood] = useState<PhotoMood | "">(photo.mood ?? "");
  const [occasion, setOccasion] = useState(photo.occasion ?? "");
  const [tagsRaw, setTagsRaw] = useState(photo.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose, isPending]);

  function handleSave() {
    setError(null);
    if (alt.trim().length < 3) {
      setError("Texte alternatif requis (3 caractères min).");
      return;
    }
    startTransition(async () => {
      const result = await updatePortfolioPhoto(photo.id, {
        alt,
        caption: caption || null,
        category,
        season: season || null,
        mood: mood || null,
        occasion: occasion || null,
        tags: tagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Supprimer définitivement cette photo ? Cette action est irréversible.",
      )
    )
      return;
    startTransition(async () => {
      const result = await deletePortfolioPhoto(photo.id);
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modifier la photo"
      className="fixed inset-0 z-50 bg-black/50 overflow-y-auto"
      onClick={() => !isPending && onClose()}
    >
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] w-full max-w-3xl overflow-hidden grid grid-cols-1 md:grid-cols-[1fr_1fr]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Preview */}
          <div className="relative aspect-square md:aspect-auto bg-[var(--color-bone)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={alt}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* Form */}
          <div className="p-5 space-y-3 overflow-y-auto max-h-[80vh]">
            <header className="flex items-center justify-between mb-1">
              <p
                className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Métadonnées
              </p>
              <button
                type="button"
                onClick={() => !isPending && onClose()}
                aria-label="Fermer"
                className="w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--color-bone)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </header>

            {error && (
              <p
                role="alert"
                className="text-xs p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                ⚠ {error}
              </p>
            )}

            <Field label="Texte alternatif" required>
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                disabled={isPending}
                className={inputCls}
              />
            </Field>

            <Field label="Légende (optionnel)">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={isPending}
                placeholder="Ex : French moderne nude"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Catégorie" required>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                  disabled={isPending}
                  className={inputCls}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Saison">
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value as Season | "")}
                  disabled={isPending}
                  className={inputCls}
                >
                  {SEASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Mood">
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value as PhotoMood | "")}
                  disabled={isPending}
                  className={inputCls}
                >
                  {MOOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Occasion">
                <input
                  type="text"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  disabled={isPending}
                  placeholder="Ex : mariage"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Tags (séparés par virgule)">
              <input
                type="text"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                disabled={isPending}
                placeholder="french, chrome, paillettes"
                className={inputCls}
              />
            </Field>

            <footer className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--color-line)]">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Supprimer
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span
        className="block text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
        {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
