"use client";

/**
 * Champ d'upload pour une bannière email (slot header ou footer).
 *
 * Affiche un aperçu de l'image actuelle (si définie) + bouton de remplacement
 * + bouton de suppression. Upload via server action.
 */

import { useState, useTransition } from "react";
import {
  removeEmailBanner,
  uploadEmailBanner,
} from "@/lib/actions/email-banner";

type Slot = "header" | "footer";

type Props = {
  slot: Slot;
  label: string;
  hint: string;
  currentUrl: string | null;
};

export function EmailBannerField({ slot, label, hint, currentUrl }: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadEmailBanner(slot, fd);
      if (res.ok) setUrl(res.url);
      else setError(res.error);
      // Reset input pour permettre re-sélection
      e.target.value = "";
    });
  }

  function handleRemove() {
    if (!confirm("Supprimer cette bannière ?")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeEmailBanner(slot);
      if (res.ok) setUrl(null);
      else setError(res.error);
    });
  }

  const inputId = `banner-${slot}`;

  return (
    <div className="space-y-2.5">
      <label
        className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </label>
      <p
        className="text-[11px] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {hint}
      </p>

      {url ? (
        <div className="space-y-2">
          <div className="rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] bg-[var(--color-bone)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Aperçu ${label}`}
              className="w-full h-auto block"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={inputId}
              className={`inline-flex items-center px-4 h-9 rounded-full text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                pending
                  ? "opacity-50 cursor-not-allowed"
                  : "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)]/70 border border-[var(--color-violet-600)]/30"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              Remplacer
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="inline-flex items-center px-4 h-9 rounded-full border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-dashed border-[var(--color-violet-600)]/50 text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
            pending
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-[var(--color-violet-50)]"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {pending ? "Upload…" : "Choisir une image"}
        </label>
      )}

      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        disabled={pending}
        className="sr-only"
      />

      {error && (
        <p
          role="alert"
          className="text-[11px] text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
