"use client";

/**
 * Modale de déplacement d'un RDV.
 *
 * Flow :
 *  1. L'admin choisit une date (date picker, min = aujourd'hui)
 *  2. Au changement → fetch des créneaux dispo via Server Action
 *     (computeAvailableSlots avec excludeBookingId)
 *  3. Affichage des créneaux en grille, click pour sélectionner
 *  4. Raison optionnelle
 *  5. Bouton confirmer → action rescheduleBookingAdmin
 *
 * Le créneau actuel est marqué visuellement "actuel" et non sélectionnable.
 */

import { useEffect, useState, useTransition } from "react";
import {
  getAvailableSlotsForReschedule,
  rescheduleBookingAdmin,
} from "@/lib/actions/booking-admin";
import { ModalPortal } from "@/components/modal-portal";

type Props = {
  bookingId: string;
  currentDate: string; // YYYY-MM-DD
  currentStartTime: string; // HH:MM
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

type SlotsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "loaded";
      slots: string[];
      reason?: string;
      bookingDate: string;
      bookingStartTime: string;
    }
  | { kind: "error"; message: string };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function REASON_FROM_RESPONSE(reason: string | undefined): string {
  switch (reason) {
    case "MONTH_NOT_OPEN":
      return "Ce mois n'est pas ouvert à la réservation.";
    case "DAY_CLOSED":
      return "Le salon est fermé ce jour.";
    case "PAST_DATE":
      return "Date passée.";
    case "NO_BUSINESS_HOURS_CONFIG":
      return "Horaires non configurés pour ce jour.";
    default:
      return "Aucun créneau disponible à cette date.";
  }
}

export function RescheduleDialog({
  bookingId,
  currentDate,
  currentStartTime,
  onCancel,
  onSuccess,
}: Props) {
  const [date, setDate] = useState<string>(currentDate);
  const [slotsState, setSlotsState] = useState<SlotsState>({ kind: "idle" });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch initial à l'ouverture
  useEffect(() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      fetchSlots(date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fetchSlots(d: string) {
    setSelectedSlot(null);
    setSlotsState({ kind: "loading" });
    startTransition(async () => {
      const res = await getAvailableSlotsForReschedule(bookingId, d);
      if (res.ok) {
        setSlotsState({
          kind: "loaded",
          slots: res.slots,
          reason: res.reason,
          bookingDate: res.booking.date,
          bookingStartTime: res.booking.startTime,
        });
      } else {
        setSlotsState({ kind: "error", message: res.error });
      }
    });
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      fetchSlots(newDate);
    }
  }

  function handleConfirm() {
    if (!selectedSlot) return;
    setError(null);
    startTransition(async () => {
      const res = await rescheduleBookingAdmin(
        bookingId,
        date,
        selectedSlot,
        reason.trim() || undefined,
      );
      if (res.ok) {
        onSuccess(res.message ?? "RDV déplacé.");
      } else {
        setError(res.error);
      }
    });
  }

  const isSameAsCurrent =
    date === currentDate && selectedSlot === currentStartTime;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Déplacer la réservation"
      className="fixed inset-0 z-[60] bg-black/40 grid place-items-center px-4 py-8 overflow-y-auto"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Déplacer la réservation
          </h3>
          <p
            className="text-xs text-[var(--color-ink-500)] mt-1"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Créneau actuel :{" "}
            <strong className="text-[var(--color-ink-700)]">
              {currentDate} à {currentStartTime}
            </strong>
            . La cliente sera notifiée par email.
          </p>
        </div>

        {/* Date picker */}
        <div className="space-y-1.5">
          <label
            htmlFor="reschedule-date"
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Nouvelle date <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="reschedule-date"
            type="date"
            min={todayIso()}
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            disabled={isPending}
            className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          />
        </div>

        {/* Slots */}
        <div className="space-y-2">
          <p
            className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Créneaux disponibles
          </p>

          {slotsState.kind === "loading" && (
            <p
              className="text-xs text-[var(--color-ink-500)] py-4"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Chargement…
            </p>
          )}

          {slotsState.kind === "error" && (
            <p
              className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {slotsState.message}
            </p>
          )}

          {slotsState.kind === "loaded" && slotsState.slots.length === 0 && (
            <p
              className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {REASON_FROM_RESPONSE(slotsState.reason)}
            </p>
          )}

          {slotsState.kind === "loaded" && slotsState.slots.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {slotsState.slots.map((slot) => {
                const isCurrent =
                  date === slotsState.bookingDate &&
                  slot === slotsState.bookingStartTime;
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    disabled={isPending}
                    className={`px-2 py-2 rounded-[var(--radius-sm)] text-xs border transition-colors ${
                      isSelected
                        ? "bg-[var(--color-violet-600)] text-white border-[var(--color-violet-600)]"
                        : isCurrent
                          ? "bg-[var(--color-bone)] text-[var(--color-ink-500)] border-[var(--color-line)] line-through"
                          : "bg-[var(--color-paper)] text-[var(--color-ink-900)] border-[var(--color-line)] hover:border-[var(--color-violet-600)] hover:bg-[var(--color-violet-50)]"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    style={{ fontFamily: "var(--font-ui)" }}
                    title={isCurrent ? "Créneau actuel" : undefined}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Raison optionnelle */}
        <div className="space-y-1.5">
          <label
            htmlFor="reschedule-reason"
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Motif communiqué à la cliente{" "}
            <span className="text-[var(--color-ink-500)] normal-case tracking-normal">
              (optionnel)
            </span>
          </label>
          <textarea
            id="reschedule-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex : indisponibilité ce jour-là, créneau ajusté à votre demande, etc."
            disabled={isPending}
            className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y"
            style={{ fontFamily: "var(--font-ui)" }}
          />
        </div>

        {error && (
          <p
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || !selectedSlot || isSameAsCurrent}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isPending ? "Déplacement…" : "Confirmer le déplacement"}
          </button>
        </div>
      </div>
    </div>
  );

  return <ModalPortal>{overlay}</ModalPortal>;
}
