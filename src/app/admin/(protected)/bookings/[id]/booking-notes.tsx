"use client";

/**
 * Éditeur de notes admin pour une booking.
 * Save explicit (bouton) avec feedback. Bouton désactivé tant qu'il n'y a pas eu de changement.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBookingAdminNotes } from "@/lib/actions/booking-admin";

type Props = {
  bookingId: string;
  initialNotes: string;
};

export function BookingNotes({ bookingId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = notes !== initialNotes;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveBookingAdminNotes(bookingId, notes);
      if (result.ok) {
        setSavedAt(new Date());
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        rows={5}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Allergies, préférences, historique particulier… (5000 caractères max)"
        maxLength={5000}
        disabled={isPending}
        className="w-full px-4 py-3 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all resize-y"
        style={{ fontFamily: "var(--font-ui)" }}
      />
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {error ? (
            <span className="text-[var(--color-danger)]">⚠ {error}</span>
          ) : savedAt && !dirty ? (
            <>
              ✓ Enregistré à{" "}
              {savedAt.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </>
          ) : dirty ? (
            "Modifications non enregistrées"
          ) : (
            `${notes.length}/5000 caractères`
          )}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
