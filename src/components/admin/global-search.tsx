"use client";

/**
 * GlobalSearch — barre de recherche inline du topbar admin (DESKTOP only).
 *
 * Affichée uniquement sur ≥ sm. Sur mobile, c'est `<GlobalSearchMobile>` qui
 * prend le relais avec un bouton loupe ouvrant une modale plein écran.
 *
 *  - Cmd+K / Ctrl+K → focus le champ
 *  - Debounce 200 ms (cf. hook useGlobalSearch)
 *  - Dropdown overlay sous l'input
 *  - Navigation clavier ↑↓ Enter Esc
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminIcon } from "./admin-icon";
import {
  type FlatItem,
  type SearchGroup,
  useGlobalSearch,
} from "./use-global-search";

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const search = useGlobalSearch();

  // Cmd+K / Ctrl+K → focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click dehors → ferme
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectItem = useCallback(
    (item: FlatItem) => {
      setOpen(false);
      search.reset();
      router.push(item.url);
    },
    [router, search],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      search.reset();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || search.flatItems.length === 0) return;
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

  const showDropdown =
    open &&
    search.hasResults &&
    (search.loading || search.groups.length > 0 || search.error);

  return (
    <div
      ref={containerRef}
      className="flex-1 max-w-md relative hidden sm:block"
      role="search"
    >
      <label htmlFor="admin-search" className="sr-only">
        Rechercher
      </label>
      <AdminIcon
        name="search"
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-500)] pointer-events-none"
      />
      <input
        ref={inputRef}
        id="admin-search"
        type="search"
        autoComplete="off"
        placeholder="Rechercher RDV, contacts, cartes, ebooks…"
        value={search.query}
        onChange={(e) => {
          search.setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown ? "true" : "false"}
        aria-controls="admin-search-results"
        className="w-full h-10 pl-10 pr-14 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-sm text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
        style={{ fontFamily: "var(--font-ui)" }}
      />
      <kbd
        className="hidden md:inline-flex items-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 h-5 rounded text-[10px] bg-[var(--color-bone)] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        ⌘K
      </kbd>

      {showDropdown && (
        <div
          id="admin-search-results"
          role="listbox"
          aria-label="Résultats de recherche"
          className="absolute left-0 right-0 mt-2 max-h-[70vh] overflow-y-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] z-40"
        >
          <ResultsBody
            loading={search.loading}
            error={search.error}
            groups={search.groups}
            debouncedQuery={search.debouncedQuery}
            activeIndex={search.activeIndex}
            onHover={(i) => search.setActiveIndex(i)}
            onSelect={selectItem}
          />
        </div>
      )}
    </div>
  );
}

// ─── Rendering partagé entre desktop + mobile ──────────────

export function ResultsBody({
  loading,
  error,
  groups,
  debouncedQuery,
  activeIndex,
  onHover,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  groups: SearchGroup[];
  debouncedQuery: string;
  activeIndex: number;
  onHover: (i: number) => void;
  onSelect: (item: FlatItem) => void;
}) {
  let itemCursor = -1;
  return (
    <>
      {loading && (
        <div
          className="px-4 py-3 text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Recherche…
        </div>
      )}
      {error && !loading && (
        <div
          className="px-4 py-3 text-xs text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {error}
        </div>
      )}
      {!loading && !error && groups.length === 0 && (
        <div
          className="px-4 py-6 text-center text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucun résultat pour <strong>{debouncedQuery}</strong>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.type} className="py-1.5">
          <p
            className="px-4 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] bg-[var(--color-bone)]/40"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {g.label}
          </p>
          <ul>
            {g.items.map((it) => {
              // eslint-disable-next-line react-hooks/immutability -- index plat (nav clavier) recalculé à chaque render
              itemCursor += 1;
              const cursorAtThis = itemCursor;
              const isActive = cursorAtThis === activeIndex;
              return (
                <li key={`${g.type}:${it.id}`}>
                  <Link
                    href={it.url}
                    role="option"
                    aria-selected={isActive}
                    onClick={(e) => {
                      e.preventDefault();
                      onSelect({ ...it, groupLabel: g.label });
                    }}
                    onMouseEnter={() => onHover(cursorAtThis)}
                    className={`block px-4 py-2.5 ${
                      isActive
                        ? "bg-[var(--color-violet-50)]"
                        : "hover:bg-[var(--color-violet-50)]/50"
                    } transition-colors`}
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    <p className="text-sm text-[var(--color-ink-900)] truncate">
                      {it.label}
                    </p>
                    {it.sublabel && (
                      <p className="text-[11px] text-[var(--color-ink-500)] truncate">
                        {it.sublabel}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
