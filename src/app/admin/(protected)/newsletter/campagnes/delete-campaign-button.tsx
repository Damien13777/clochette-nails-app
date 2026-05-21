"use client";

/**
 * Bouton de suppression d'une campagne (uniquement DRAFT). Avec confirm().
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaign } from "@/lib/actions/newsletter-campaigns";

type Props = { id: string; subject: string };

export function DeleteCampaignButton({ id, subject }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = confirm(
      `Supprimer définitivement la campagne « ${subject} » ?`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteCampaign(id);
      if (result.ok) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label="Supprimer la campagne"
      title="Supprimer"
      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--color-line)] text-[var(--color-ink-500)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors bg-[var(--color-paper)]"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}
