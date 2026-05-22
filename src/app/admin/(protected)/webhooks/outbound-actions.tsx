"use client";

/**
 * Bouton "Détail" + modale d'inspection pour une ligne OutboundEvent.
 *
 * Rend un bouton dans la cellule de la table. Au clic, ouvre une <Modal>
 * affichant les métadonnées, le payload formaté, la dernière erreur et
 * des actions admin (rejouer / abandonner) câblées sur les server actions
 * de @/lib/actions/outbound-admin.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/admin/modal";
import {
  abandonOutboundEvent,
  retryOutboundEvent,
} from "@/lib/actions/outbound-admin";

type EventStatus = "PENDING" | "DELIVERED" | "FAILED" | "ABANDONED";

type EventProps = {
  id: string;
  type: string;
  payload: unknown;
  targetUrl: string;
  targetService: string;
  status: EventStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

type Props = { event: EventProps };

type Feedback = { kind: "success" | "error"; text: string } | null;

const STATUS_META: Record<EventStatus, { label: string; cls: string }> = {
  PENDING: {
    label: "En attente",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
  },
  DELIVERED: {
    label: "Livré",
    cls: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
  },
  FAILED: {
    label: "Échec",
    cls: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  },
  ABANDONED: {
    label: "Abandonné",
    cls: "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
  },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function OutboundDetailButton({ event }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const router = useRouter();

  const status = STATUS_META[event.status];
  const isDelivered = event.status === "DELIVERED";
  const isAbandoned = event.status === "ABANDONED";

  function runAction(
    fn: () => Promise<
      { ok: true; message?: string } | { ok: false; error: string }
    >,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setFeedback({
          kind: "success",
          text: result.message ?? "Action effectuée.",
        });
        router.refresh();
      } else {
        setFeedback({ kind: "error", text: result.error });
      }
    });
  }

  function confirmRetry() {
    if (
      !window.confirm(
        "Rejouer cet event maintenant ? Le compteur de tentatives sera remis à 0.",
      )
    ) {
      return;
    }
    runAction(() => retryOutboundEvent(event.id));
  }

  function confirmAbandon() {
    if (
      !window.confirm(
        "Marquer cet event comme abandonné ? Plus aucun retry ne sera tenté.",
      )
    ) {
      return;
    }
    runAction(() => abandonOutboundEvent(event.id));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        className="inline-flex items-center px-3 h-7 rounded-full border border-[var(--color-line)] text-[10px] uppercase tracking-[0.06em] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Détail
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Event ${event.type}`}
        subtitle={`#${event.id.slice(0, 8)} · ${event.targetService}`}
        maxWidthClass="max-w-[720px]"
      >
        <div className="space-y-6">
          {feedback && (
            <div
              role="alert"
              className={`text-xs p-3 rounded-[var(--radius-sm)] ${
                feedback.kind === "success"
                  ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
                  : "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
              }`}
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {feedback.text}
            </div>
          )}

          <section className="space-y-3">
            <h3
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Métadonnées
            </h3>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-xs">
              <dt
                className="text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Status
              </dt>
              <dd>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] whitespace-nowrap ${status.cls}`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {status.label}
                </span>
              </dd>

              <dt
                className="text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Tentatives
              </dt>
              <dd
                className="text-[var(--color-ink-900)] tabular-nums"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {event.attempts}/{event.maxAttempts}
              </dd>

              <dt
                className="text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Créé le
              </dt>
              <dd
                className="text-[var(--color-ink-900)] tabular-nums"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {formatDateTime(event.createdAt)}
              </dd>

              {event.deliveredAt && (
                <>
                  <dt
                    className="text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    Livré le
                  </dt>
                  <dd
                    className="text-[var(--color-ink-900)] tabular-nums"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {formatDateTime(event.deliveredAt)}
                  </dd>
                </>
              )}

              {(event.status === "PENDING" || event.status === "FAILED") && (
                <>
                  <dt
                    className="text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    Prochain essai
                  </dt>
                  <dd
                    className="text-[var(--color-ink-900)] tabular-nums"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {formatDateTime(event.nextAttemptAt)}
                  </dd>
                </>
              )}

              <dt
                className="text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Cible
              </dt>
              <dd
                className="text-[var(--color-ink-900)] truncate font-mono text-[11px]"
                title={event.targetUrl}
              >
                {event.targetUrl}
              </dd>
            </dl>
          </section>

          <section className="space-y-3">
            <h3
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Payload
            </h3>
            <pre
              className="max-h-[300px] overflow-auto bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] p-3 text-xs font-mono whitespace-pre-wrap break-words text-[var(--color-ink-900)]"
            >
              {safeStringify(event.payload)}
            </pre>
          </section>

          {event.lastError && (
            <section className="space-y-3">
              <h3
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Dernière erreur
              </h3>
              <pre
                className="max-h-[200px] overflow-auto bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/30 rounded-[var(--radius-sm)] p-3 text-xs font-mono whitespace-pre-wrap break-words text-[var(--color-danger)]"
              >
                {event.lastError}
              </pre>
            </section>
          )}

          <section className="space-y-3 pt-2 border-t border-[var(--color-line)]">
            <h3
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmRetry}
                disabled={isPending || isDelivered}
                title={
                  isDelivered ? "Event déjà livré, rien à rejouer." : undefined
                }
                className="inline-flex items-center px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Rejouer maintenant
              </button>
              <button
                type="button"
                onClick={confirmAbandon}
                disabled={isPending || isDelivered || isAbandoned}
                title={
                  isDelivered
                    ? "Event déjà livré."
                    : isAbandoned
                    ? "Déjà abandonné."
                    : undefined
                }
                className="inline-flex items-center px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-warning)]/40 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Abandonner
              </button>
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
