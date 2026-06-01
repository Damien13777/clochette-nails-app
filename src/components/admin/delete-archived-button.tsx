"use client";

/**
 * Bouton « Supprimer définitivement » pour les éléments ARCHIVÉS (prestations,
 * options, articles de blog). Demande confirmation, appelle l'action serveur
 * passée en prop, redirige vers la liste en cas de succès, et affiche l'erreur
 * sinon (ex : élément encore référencé par des réservations → suppression
 * refusée côté serveur).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Action serveur déjà liée à l'id (ex: deleteService.bind(null, id)). */
  onDelete: () => Promise<{ ok: true } | { ok: false; error: string }>;
  redirectTo: string;
  /** Ex : « cette prestation », « cette option », « cet article ». */
  confirmLabel: string;
};

export function DeleteArchivedButton({
  onDelete,
  redirectTo,
  confirmLabel,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-10 pt-6 border-t border-[var(--color-danger)]/20 space-y-2">
      <p
        className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Zone de danger
      </p>
      <p
        className="text-xs text-[var(--color-ink-500)] max-w-[60ch]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        La suppression est définitive. Elle est refusée si des réservations sont
        liées (l'élément reste alors archivé pour préserver l'historique).
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              `Supprimer définitivement ${confirmLabel} ? Cette action est irréversible.`,
            )
          )
            return;
          setError(null);
          startTransition(async () => {
            const res = await onDelete();
            if (res.ok) {
              router.push(redirectTo);
              router.refresh();
            } else {
              setError(res.error);
            }
          });
        }}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Suppression…" : "Supprimer définitivement"}
      </button>
      {error && (
        <p
          className="text-xs text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
