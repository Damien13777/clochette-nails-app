"use client";

/**
 * Step 2 — Options additionnelles (skippable).
 */

import type { OptionLite } from "../reservation-flow";

type Props = {
  options: OptionLite[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onConfirm: () => void;
};

export function OptionsPicker({ options, selectedIds, onChange, onConfirm }: Props) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="space-y-5 pt-4">
      {options.length === 0 ? (
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune option disponible pour cette prestation.
        </p>
      ) : (
        <ul className="space-y-2">
          {options.map((opt) => {
            const isChecked = selectedIds.includes(opt.id);
            return (
              <li key={opt.id}>
                <label
                  className={`flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-all ${
                    isChecked
                      ? "border-[var(--color-violet-600)] bg-[var(--color-violet-50)]"
                      : "border-[var(--color-line)] hover:bg-[var(--color-violet-50)]/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(opt.id)}
                    className="sr-only peer"
                  />
                  <span
                    className={`shrink-0 mt-0.5 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
                      isChecked
                        ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
                        : "border-[var(--color-ink-300)] bg-[var(--color-paper)]"
                    }`}
                    aria-hidden="true"
                  >
                    {isChecked && (
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-sm"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {opt.title}
                      </span>
                      <span
                        className="text-xs text-[var(--color-ink-500)] shrink-0"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        + {opt.addedDurationMinutes} min
                      </span>
                    </div>
                    {opt.description && (
                      <p
                        className="text-xs text-[var(--color-ink-500)] mt-0.5"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {opt.description}
                      </p>
                    )}
                    {isChecked && opt.disclaimer && (
                      <p
                        role="note"
                        className="mt-1.5 text-[11px] leading-snug text-[var(--color-danger)] flex items-start gap-1.5"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        <span aria-hidden="true">⚠</span>
                        <span>{opt.disclaimer}</span>
                      </p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {selectedIds.length === 0 ? "Continuer sans option" : "Continuer"}
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
