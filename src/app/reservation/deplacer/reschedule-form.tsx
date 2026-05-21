"use client";

/**
 * Form de déplacement côté cliente :
 *  1. Date picker (min = aujourd'hui)
 *  2. Fetch slots dispo (excludeBookingId)
 *  3. Grille de créneaux cliquable
 *  4. Textarea motif (optionnel, 500 char max)
 *  5. Confirmation 2 étapes (checkbox CGV + bouton final)
 *  6. Success → écran de confirmation
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  getAvailableSlotsForClientReschedule,
  rescheduleBookingByClient,
} from "@/lib/actions/booking-client";

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

type ViewState =
  | { kind: "picking" }
  | { kind: "confirming" }
  | {
      kind: "success";
      newDate: string;
      newStartTime: string;
      newEndTime: string;
    }
  | { kind: "error"; message: string };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateFr(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

export function RescheduleForm({
  token,
  currentDate,
  currentStartTime,
}: {
  token: string;
  currentDate: string;
  currentStartTime: string;
}) {
  const [date, setDate] = useState<string>(currentDate);
  const [slotsState, setSlotsState] = useState<SlotsState>({ kind: "idle" });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [view, setView] = useState<ViewState>({ kind: "picking" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

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
      const res = await getAvailableSlotsForClientReschedule(token, d);
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

  function handleSubmit() {
    if (!selectedSlot) return;
    startTransition(async () => {
      const res = await rescheduleBookingByClient(
        token,
        date,
        selectedSlot,
        reason.trim() || undefined,
      );
      if (res.ok) {
        setView({
          kind: "success",
          newDate: res.newDate,
          newStartTime: res.newStartTime,
          newEndTime: res.newEndTime,
        });
      } else {
        setView({ kind: "error", message: res.error });
      }
    });
  }

  const isSameAsCurrent =
    date === currentDate && selectedSlot === currentStartTime;

  // ─── Success ─────────────────────────────────────────────
  if (view.kind === "success") {
    return (
      <div className="text-center bg-[#f0f9f4] border border-[#bfe3cc] rounded-[var(--radius-sm)] p-6">
        <div className="mx-auto w-12 h-12 rounded-full grid place-items-center mb-4 bg-[#2d8659]/15 text-[#1d6b48]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[#1d6b48] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Déplacement confirmé
        </p>
        <h2
          className="text-xl text-[var(--color-ink-900)] mb-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Votre nouveau créneau
        </h2>
        <p
          className="text-base text-[var(--color-ink-900)] capitalize mb-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {formatDateFr(view.newDate)}
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)] mb-4"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {view.newStartTime} – {view.newEndTime}
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)] mb-4"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Un email de confirmation vient de vous être envoyé. Votre acompte est
          conservé sur ce nouveau créneau.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────
  if (view.kind === "error") {
    return (
      <div className="text-center bg-[#fff5f0] border border-[#f0c8b0] rounded-[var(--radius-sm)] p-6">
        <div className="mx-auto w-12 h-12 rounded-full grid place-items-center mb-4 bg-[#c87850]/15 text-[#c87850]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[#c87850] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Erreur
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)] mb-4"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {view.message}
        </p>
        <button
          type="button"
          onClick={() => setView({ kind: "picking" })}
          className="text-xs uppercase tracking-[0.06em] text-[var(--color-violet-700)] hover:underline"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Recommencer
        </button>
      </div>
    );
  }

  // ─── Confirmation 2e étape ───────────────────────────────
  if (view.kind === "confirming") {
    return (
      <div className="bg-[var(--color-violet-50)] border border-[var(--color-violet-600)]/30 rounded-[var(--radius-sm)] p-5 space-y-4">
        <p
          className="text-sm text-[var(--color-ink-900)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Confirmation du nouveau créneau :
        </p>

        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] p-4">
          <p
            className="text-base text-[var(--color-ink-900)] capitalize"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {formatDateFr(date)} · {selectedSlot}
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={pending}
            className="mt-0.5 w-4 h-4 rounded border-[var(--color-ink-300)] text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
          />
          <span
            className="text-xs text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Je comprends que ce déplacement est définitif et que ce lien ne pourra
            plus servir. Mon acompte est conservé sur ce nouveau créneau.
          </span>
        </label>

        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!acknowledged || pending}
            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pending ? "Déplacement…" : "Confirmer le nouveau créneau"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAcknowledged(false);
              setView({ kind: "picking" });
            }}
            disabled={pending}
            className="inline-flex items-center justify-center px-5 py-3 rounded-full border border-[var(--color-ink-300)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-cream)] transition-colors disabled:opacity-40"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Revenir en arrière
          </button>
        </div>
      </div>
    );
  }

  // ─── Picker (default) ────────────────────────────────────
  return (
    <div className="space-y-5">
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
          disabled={pending}
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
                  disabled={pending}
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

      {/* Motif optionnel */}
      <div className="space-y-1.5">
        <label
          htmlFor="reschedule-reason"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Une raison à partager au salon ?{" "}
          <span className="text-[var(--color-ink-500)] normal-case tracking-normal">
            (facultatif)
          </span>
        </label>
        <textarea
          id="reschedule-reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex : empêchement professionnel, etc."
          disabled={pending}
          className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y"
          style={{ fontFamily: "var(--font-ui)" }}
        />
        <p
          className="text-[11px] text-[var(--color-ink-500)] text-right"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {reason.length}/500
        </p>
      </div>

      <button
        type="button"
        onClick={() => setView({ kind: "confirming" })}
        disabled={pending || !selectedSlot || isSameAsCurrent}
        className="w-full inline-flex items-center justify-center px-5 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isSameAsCurrent
          ? "Choisissez un créneau différent"
          : selectedSlot
            ? "Vérifier le nouveau créneau"
            : "Sélectionnez un créneau"}
      </button>
    </div>
  );
}
