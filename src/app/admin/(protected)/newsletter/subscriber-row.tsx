"use client";

/**
 * Ligne d'abonnée avec actions admin :
 *  - Désabonner (soft delete, garde la trace pour RGPD/preuve)
 *  - Supprimer (hard delete, droit à l'effacement RGPD)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSubscriberAdmin,
  unsubscribeSubscriberAdmin,
} from "@/lib/actions/newsletter-admin";

type Status = "active" | "pending" | "unsubscribed";

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  pending: "En attente",
  unsubscribed: "Désabonnée",
};

const STATUS_CLASS: Record<Status, string> = {
  active: "bg-[#dff5e6] text-[#1d6b48] border-[#bfe3cc]",
  pending: "bg-[#fff4e0] text-[#b3651e] border-[#f0d6a0]",
  unsubscribed: "bg-[var(--color-bone)] text-[var(--color-ink-500)] border-[var(--color-line)]",
};

type Props = {
  subscriber: {
    id: string;
    email: string;
    source: string | null;
    consentGivenAtFr: string;
    status: Status;
    confirmedAtFr: string | null;
    unsubscribedAtFr: string | null;
  };
};

export function SubscriberRow({ subscriber }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();

  function handleUnsubscribe() {
    startTransition(async () => {
      const res = await unsubscribeSubscriberAdmin(subscriber.id);
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteSubscriberAdmin(subscriber.id);
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <li className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px_120px_140px] gap-2 md:gap-4 items-center px-5 py-4 hover:bg-[var(--color-bone)]/40 transition-colors">
      {/* Email */}
      <div className="min-w-0">
        <p
          className="text-sm text-[var(--color-ink-900)] truncate"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {subscriber.email}
        </p>
        <p
          className="md:hidden text-[11px] text-[var(--color-ink-500)] mt-0.5"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {subscriber.source ?? "—"} · {subscriber.consentGivenAtFr}
        </p>
      </div>

      {/* Source (desktop) */}
      <p
        className="hidden md:block text-xs text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {subscriber.source ?? "—"}
      </p>

      {/* Date saisie (desktop) */}
      <p
        className="hidden md:block text-xs text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {subscriber.consentGivenAtFr}
      </p>

      {/* Statut */}
      <div>
        <span
          className={`inline-block px-2 py-1 rounded-full text-[11px] border ${STATUS_CLASS[subscriber.status]}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {STATUS_LABEL[subscriber.status]}
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-1.5">
        {subscriber.status !== "unsubscribed" && (
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={pending}
            title="Désabonner manuellement"
            className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-paper)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Désabo
          </button>
        )}
        {confirmingDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pending ? "…" : "Confirmer ?"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={pending}
            title="Supprimer définitivement (droit à l'effacement RGPD)"
            className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Suppr
          </button>
        )}
      </div>
    </li>
  );
}
