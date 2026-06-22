"use client";

/**
 * Bloc admin "Rappels par mail" pour le détail d'une réservation.
 *
 * Affiche le statut des 2 rappels automatiques (J-7 et J-1) :
 *  - Soit la date d'envoi (rappel déjà parti)
 *  - Soit "Programmé pour X" (calculé à partir de la date du RDV)
 *  - Soit "Non envoyé" (RDV passé sans rappel — rare)
 *
 * Bouton "Renvoyer" pour chaque type, qui appelle `resendBookingReminder`.
 * Disponible uniquement pour les bookings CONFIRMED.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendBookingReminder } from "@/lib/actions/booking-reminders";

type Props = {
  bookingId: string;
  bookingDate: string; // ISO (date du RDV)
  status: string; // BookingStatus
  reminderJ7SentAt: string | null;
  reminderJ1SentAt: string | null;
  reminderJ7OpenedAt: string | null;
  reminderJ1OpenedAt: string | null;
  reminderJ7BouncedAt: string | null;
  reminderJ1BouncedAt: string | null;
};

export function BookingReminders({
  bookingId,
  bookingDate,
  status,
  reminderJ7SentAt,
  reminderJ1SentAt,
  reminderJ7OpenedAt,
  reminderJ1OpenedAt,
  reminderJ7BouncedAt,
  reminderJ1BouncedAt,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<"J7" | "J1" | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = status === "CONFIRMED";
  const rdvDate = new Date(bookingDate);

  function handleResend(type: "J7" | "J1") {
    if (!confirm(
      `Renvoyer le rappel ${type === "J7" ? "J-7" : "J-1"} à la cliente ?`,
    )) return;
    setError(null);
    setFeedback(null);
    setPendingType(type);
    startTransition(async () => {
      const result = await resendBookingReminder(bookingId, type);
      setPendingType(null);
      if (result.ok) {
        setFeedback(result.message ?? "Rappel envoyé.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="text-sm p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}
      {feedback && !error && (
        <p
          className="text-sm p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ✓ {feedback}
        </p>
      )}

      <ReminderRow
        label="J-7"
        scheduledFor={addDays(rdvDate, -7)}
        sentAt={reminderJ7SentAt}
        openedAt={reminderJ7OpenedAt}
        bouncedAt={reminderJ7BouncedAt}
        onResend={() => handleResend("J7")}
        disabled={!isConfirmed || (isPending && pendingType !== "J7")}
        loading={isPending && pendingType === "J7"}
      />
      <ReminderRow
        label="J-1"
        scheduledFor={addDays(rdvDate, -1)}
        sentAt={reminderJ1SentAt}
        openedAt={reminderJ1OpenedAt}
        bouncedAt={reminderJ1BouncedAt}
        onResend={() => handleResend("J1")}
        disabled={!isConfirmed || (isPending && pendingType !== "J1")}
        loading={isPending && pendingType === "J1"}
      />

      {!isConfirmed && (
        <p
          className="text-[11px] text-[var(--color-ink-500)] mt-2"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Les rappels ne sont disponibles que pour les réservations confirmées.
        </p>
      )}
    </div>
  );
}

function ReminderRow({
  label,
  scheduledFor,
  sentAt,
  openedAt,
  bouncedAt,
  onResend,
  disabled,
  loading,
}: {
  label: string;
  scheduledFor: Date;
  sentAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  onResend: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  const sent = sentAt !== null;
  // eslint-disable-next-line react-hooks/purity -- comparaison à l'heure courante pour le statut d'envoi
  const scheduledPassed = scheduledFor.getTime() < Date.now();
  const statusLabel = sent
    ? `Envoyé le ${formatDateTime(new Date(sentAt))}`
    : scheduledPassed
      ? "Non envoyé (date dépassée)"
      : `Programmé pour le ${formatDate(scheduledFor)}`;

  const statusCls = sent
    ? "text-[var(--color-success)]"
    : scheduledPassed
      ? "text-[var(--color-warning)]"
      : "text-[var(--color-ink-500)]";

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bone)]/30">
      <div className="min-w-0">
        <p
          className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Rappel {label}
        </p>
        <p
          className={`text-xs mt-1 ${statusCls}`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {sent ? "✓ " : ""}
          {statusLabel}
        </p>
        {sent &&
          (bouncedAt ? (
            <p
              className="text-[11px] mt-0.5 text-[var(--color-danger)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              ⚠ N&apos;est pas arrivé (rejeté le{" "}
              {formatDateTime(new Date(bouncedAt))})
            </p>
          ) : openedAt ? (
            <p
              className="text-[11px] mt-0.5 text-[var(--color-violet-700)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              👁 Ouvert le {formatDateTime(new Date(openedAt))}
            </p>
          ) : (
            <p
              className="text-[11px] mt-0.5 text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Pas encore ouvert
            </p>
          ))}
      </div>
      <button
        type="button"
        onClick={onResend}
        disabled={disabled}
        className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-full border border-[var(--color-violet-600)]/40 text-[var(--color-violet-700)] text-[11px] uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {loading ? "Envoi…" : sent ? "Renvoyer" : "Envoyer maintenant"}
      </button>
    </div>
  );
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
