"use client";

/**
 * Composant Modal réutilisable côté admin.
 *
 * Overlay centré avec backdrop sombre, close via clic backdrop / touche Esc /
 * bouton ✕. Pas de dépendance externe (Radix, Headless UI, etc.). Focus
 * trap basique (autofocus sur le bouton close).
 *
 * Usage :
 *   <Modal open={open} onClose={() => setOpen(false)} title="Détail Net">
 *     <p>contenu...</p>
 *   </Modal>
 */

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Largeur max (defaults: 640px). Tailwind class ou inline width. */
  maxWidthClass?: string;
  children: React.ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = "max-w-[640px]",
  children,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Autofocus close button
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-[var(--color-ink-900)]/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[85vh] overflow-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]`}
      >
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[var(--color-line)]">
          <div className="min-w-0">
            <h2
              className="text-xl text-[var(--color-ink-900)] leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-xs text-[var(--color-ink-500)] mt-1"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-[var(--color-ink-500)] hover:bg-[var(--color-bone)] hover:text-[var(--color-ink-900)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)]/40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
