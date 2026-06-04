"use client";

/**
 * Hook custom — encapsule toute la logique de recherche globale admin.
 *
 * Partagé entre :
 *  - GlobalSearch (desktop, barre inline dans le topbar)
 *  - GlobalSearchMobile (mobile, modale plein écran déclenchée par un bouton loupe)
 *
 * Gère : query, debounce, fetch /api/v1/admin/search, résultats groupés,
 * loading, error, état actif pour navigation clavier (↑↓ Enter), reset.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type SearchItem = {
  id: string;
  label: string;
  sublabel?: string;
  url: string;
};

export type SearchGroup = {
  type: string;
  label: string;
  items: SearchItem[];
};

export type FlatItem = SearchItem & { groupLabel: string };

export function useGlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const flatItems = useMemo<FlatItem[]>(
    () =>
      groups.flatMap((g) =>
        g.items.map((it) => ({ ...it, groupLabel: g.label })),
      ),
    [groups],
  );

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch quand debouncedQuery change
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de l'état quand la requête repasse sous 2 caractères
      setGroups([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/v1/admin/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: debouncedQuery }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ groups: SearchGroup[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setGroups(data.groups ?? []);
        setActiveIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur de recherche");
        setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const reset = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setGroups([]);
    setActiveIndex(0);
    setError(null);
  }, []);

  const moveDown = useCallback(() => {
    setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
  }, [flatItems.length]);

  const moveUp = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);

  return {
    query,
    setQuery,
    debouncedQuery,
    groups,
    flatItems,
    loading,
    error,
    activeIndex,
    setActiveIndex,
    moveDown,
    moveUp,
    reset,
    hasResults: debouncedQuery.length >= 2,
  };
}
