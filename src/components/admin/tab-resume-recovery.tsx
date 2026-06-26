"use client";

/**
 * Auto-récupération d'un onglet admin laissé inactif (iPad / Safari).
 *
 * Safari suspend le JavaScript d'un onglet resté longtemps en arrière-plan :
 * au retour, le scroll (natif) marche mais la navigation App Router (JS) est
 * figée — les clics « ne vont nulle part ». Le seul remède fiable est un
 * rechargement complet (le Cmd+R que l'admin fait à la main aujourd'hui).
 *
 * Ce composant le fait automatiquement : si l'onglet est resté caché au-delà
 * du seuil et qu'on y revient, on recharge la page. Couvre aussi la
 * restauration depuis le bfcache iOS (pageshow.persisted). Rend `null`.
 */

import { useEffect } from "react";

/** Inactivité de l'onglet (caché) au-delà de laquelle on recharge au retour. */
const RELOAD_AFTER_HIDDEN_MS = 10 * 60 * 1000;

export function TabResumeRecovery() {
  useEffect(() => {
    let hiddenAt: number | null = null;

    function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        const awayMs = Date.now() - hiddenAt;
        hiddenAt = null;
        if (awayMs >= RELOAD_AFTER_HIDDEN_MS) {
          window.location.reload();
        }
      }
    }

    function onPageShow(e: PageTransitionEvent) {
      // Restauration depuis le bfcache (iOS/Safari) → état JS potentiellement
      // figé : on repart sur une page fraîche.
      if (e.persisted) {
        window.location.reload();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
