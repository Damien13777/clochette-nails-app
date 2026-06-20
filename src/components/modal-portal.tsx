"use client";

/**
 * ModalPortal — rend ses enfants dans <body> via createPortal + verrouille le
 * scroll de fond tant qu'il est monté.
 *
 * Pourquoi : une modale `position: fixed` rendue dans le contenu admin est
 * piégée par un ancêtre qui crée un containing block pour les éléments fixed
 * (la fiche RDV sous la topbar) → la modale apparaît sous la topbar et n'est
 * pas scrollable jusqu'en haut. Portaliser vers <body> l'en fait sortir. Même
 * besoin que photo-lightbox / calendar-side-panel ; centralisé ici pour les
 * dialogs admin afin de ne pas dupliquer le boilerplate.
 */

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
