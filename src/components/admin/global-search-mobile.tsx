"use client";

/**
 * GlobalSearchMobile — bouton loupe dans le topbar mobile + modale plein écran.
 *
 * Mobile uniquement (caché ≥ sm, où `<GlobalSearch>` prend le relais en barre
 * inline). Au clic sur la loupe, ouvre une modale plein écran avec input
 * autofocus + résultats. Esc et bouton ✕ ferment.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AdminIcon } from "./admin-icon";
import { ResultsBody } from "./global-search";
import {
  type FlatItem,
  useGlobalSearch,
} from "./use-global-search";

export function GlobalSearchMobile() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const search = useGlobalSearch();

  // Mount-check pour SSR — createPortal a besoin de document.body
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock scroll body quand modale ouverte
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc → close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Autofocus input à l'ouverture
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    search.reset();
  }, [search]);

  const selectItem = useCallback(
    (item: FlatItem) => {
      handleClose();
      router.push(item.url);
    },
    [router, handleClose],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
      return;
    }
    if (search.flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      search.moveDown();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      search.moveUp();
    } else if (e.key === "Enter") {
      const item = search.flatItems[search.activeIndex];
      if (item) {
        e.preventDefault();
        selectItem(item);
      }
    }
  }

  return (
    <>
      {/* Bouton loupe (mobile only) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir la recherche"
        className="sm:hidden w-10 h-10 grid place-items-center text-[var(--color-ink-900)] hover:bg-[var(--color-violet-50)] rounded-full transition-colors"
      >
        <AdminIcon name="search" size={20} />
      </button>

      {/* Modale plein écran, montée via portal dans document.body pour
          éviter qu'un parent avec transform/filter ne casse le position:fixed */}
      {open && mounted && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recherche globale"
          className="fixed inset-0 z-50 bg-[var(--color-cream)] flex flex-col sm:hidden"
        >
          {/* Header avec input + close (hauteur fixe pour le flex parent) */}
          <header className="shrink-0 h-16 bg-[var(--color-cream)] border-b border-[var(--color-line)]">
            <div className="h-full px-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Fermer la recherche"
                className="shrink-0 w-10 h-10 grid place-items-center text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] rounded-full transition-colors"
              >
                <AdminIcon name="x" size={20} />
              </button>
              <div className="flex-1 relative">
                <AdminIcon
                  name="search"
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-500)] pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="search"
                  autoComplete="off"
                  placeholder="Nom, email, montant, ref…"
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-autocomplete="list"
                  aria-controls="admin-search-results-mobile"
                  className="w-full h-10 pl-10 pr-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-base text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] transition-all"
                  style={{ fontFamily: "var(--font-ui)" }}
                />
              </div>
            </div>
          </header>

          {/* Résultats — scroll vertical sur le reste de l'écran.
              min-h-0 essentiel : sans ça, flex-1 garde la min-height auto
              et le contenu peut overflow sans déclencher le scroll. */}
          <div
            id="admin-search-results-mobile"
            role="listbox"
            aria-label="Résultats de recherche"
            className="flex-1 min-h-0 overflow-y-auto"
          >
            {search.hasResults ? (
              <ResultsBody
                loading={search.loading}
                error={search.error}
                groups={search.groups}
                debouncedQuery={search.debouncedQuery}
                activeIndex={search.activeIndex}
                onHover={(i) => search.setActiveIndex(i)}
                onSelect={selectItem}
              />
            ) : (
              <div
                className="px-6 py-12 text-center"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                <p className="text-sm text-[var(--color-ink-500)] mb-2">
                  Tape au moins 2 caractères pour chercher
                </p>
                <p className="text-[11px] text-[var(--color-ink-500)] leading-relaxed">
                  RDV, contacts, cartes cadeau, ebooks, articles blog,
                  abonnées… Tu peux aussi chercher par <strong>montant</strong>{" "}
                  (ex: « 65 ») ou <strong>référence courte</strong>.
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
