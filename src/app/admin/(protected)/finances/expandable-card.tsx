"use client";

/**
 * ExpandableCard — wrapper client pour les KPI/breakdown cards cliquables.
 *
 * Rend les `children` dans un <button> accessible. Au clic, ouvre une <Modal>
 * avec le contenu détaillé fourni en prop. Ajoute un chevron en haut à droite
 * pour signaler le caractère interactif.
 */

import { useState } from "react";
import { Modal } from "@/components/admin/modal";

type Props = {
  children: React.ReactNode;
  modalTitle: string;
  modalSubtitle?: string;
  modalContent: React.ReactNode;
  modalMaxWidth?: string;
};

export function ExpandableCard({
  children,
  modalTitle,
  modalSubtitle,
  modalContent,
  modalMaxWidth = "max-w-[640px]",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-full text-left cursor-pointer rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)]/40 transition-all hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5"
      >
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 text-[var(--color-ink-300)] group-hover:text-[var(--color-ink-700)] pointer-events-none"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        {children}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle}
        subtitle={modalSubtitle}
        maxWidthClass={modalMaxWidth}
      >
        {modalContent}
      </Modal>
    </>
  );
}
