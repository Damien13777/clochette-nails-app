"use client";

/**
 * Champ "Avertissement" partagé pour les formulaires Service + ServiceOption.
 *
 * Checkbox "Ajouter un avertissement" + textarea conditionnelle.
 * État interne synchronisé : si une valeur initiale est fournie, la
 * checkbox démarre cochée.
 */

import { useState } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string;
};

export function DisclaimerField({ value, onChange, disabled, error }: Props) {
  const [enabled, setEnabled] = useState(value.length > 0);

  function toggle(next: boolean) {
    setEnabled(next);
    if (!next) onChange("");
  }

  return (
    <div className="space-y-3">
      <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <span
          aria-hidden="true"
          className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
            enabled
              ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
              : "border-[var(--color-line)] bg-[var(--color-paper)]"
          }`}
        >
          {enabled && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </span>
        <span>
          <span
            className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ajouter un avertissement
          </span>
          <span
            className="block text-[11px] text-[var(--color-ink-500)] mt-0.5"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Affiché en rouge sur la carte côté cliente quand la prestation /
            option est sélectionnée.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-1.5 pl-7">
          <textarea
            rows={2}
            maxLength={500}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Ex : déconseillé pendant la grossesse, prévoir un test cutané 48h avant…"
            className="w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all resize-y min-h-[3rem]"
            style={{ fontFamily: "var(--font-ui)" }}
            aria-invalid={!!error}
          />
          <p
            className="text-[11px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {value.length}/500 caractères
          </p>
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
      )}
    </div>
  );
}
