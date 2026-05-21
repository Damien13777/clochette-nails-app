"use client";

/**
 * Modale création/édition Unavailability one-off.
 *
 * Modes :
 *  - create : `initial` non fourni → form vierge ou pré-rempli depuis cellule cliquée
 *  - edit   : `initial.id` présent → pré-rempli + bouton "Supprimer"
 *
 * Les datetimes sont en local time (input type="datetime-local") puis convertis
 * en ISO côté serveur.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createUnavailability,
  deleteUnavailability,
  updateUnavailability,
} from "@/lib/actions/calendar-admin";

type Props = {
  initial?: {
    id?: string;
    startsAtLocal: string; // "YYYY-MM-DDTHH:MM"
    endsAtLocal: string;
    reason: string;
  };
  onClose: () => void;
};

/** Génère un datetime-local ISO sans timezone (pour input type="datetime-local"). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function UnavailabilityModal({ initial, onClose }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const now = new Date();
  const defaultStart = toLocalInputValue(now);
  const defaultEnd = toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000));

  const [startsAtLocal, setStartsAtLocal] = useState(
    initial?.startsAtLocal ?? defaultStart,
  );
  const [endsAtLocal, setEndsAtLocal] = useState(
    initial?.endsAtLocal ?? defaultEnd,
  );
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function handleSubmit() {
    setError(null);
    setFieldErrors({});
    setMessage(null);
    startTransition(async () => {
      // input datetime-local n'a pas de TZ → on construit une Date locale
      const startsAt = new Date(startsAtLocal);
      const endsAt = new Date(endsAtLocal);
      const payload = { startsAt, endsAt, reason: reason.trim() || undefined };
      const res = isEdit && initial?.id
        ? await updateUnavailability(initial.id, payload)
        : await createUnavailability(payload);
      if (res.ok) {
        router.refresh();
        // Si message contient avertissement RDV → on l'affiche un instant
        if (res.message && res.message.includes("⚠")) {
          setMessage(res.message);
          setTimeout(onClose, 2500);
        } else {
          onClose();
        }
      } else {
        setError(res.error);
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      }
    });
  }

  function handleDelete() {
    if (!initial?.id) return;
    startTransition(async () => {
      const res = await deleteUnavailability(initial.id!);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Modifier l'indispo" : "Nouvelle indispo"}
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-3 sm:p-4 overflow-y-auto"
      onClick={() => !pending && onClose()}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] w-full mx-auto p-5 sm:p-6 space-y-5 overflow-hidden box-border"
        style={{ maxWidth: "min(28rem, calc(100vw - 1.5rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Indisponibilité
          </p>
          <h3
            className="text-lg mt-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {isEdit ? "Modifier" : "Nouvelle indispo"}
          </h3>
          <p
            className="text-xs text-[var(--color-ink-500)] mt-1"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Bloque le créneau dans les disponibilités publiques (vacances,
            formation, RDV personnel, etc.).
          </p>
        </div>

        <DateTimeField
          label="Début"
          value={startsAtLocal}
          onChange={setStartsAtLocal}
          disabled={pending}
          error={fieldErrors.startsAt}
        />
        <DateTimeField
          label="Fin"
          value={endsAtLocal}
          onChange={setEndsAtLocal}
          disabled={pending}
          error={fieldErrors.endsAt}
        />

        <div>
          <label
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)] mb-1.5"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Motif{" "}
            <span className="text-[var(--color-ink-500)] normal-case tracking-normal">
              (interne, non visible cliente)
            </span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
            maxLength={200}
            placeholder="Ex : vacances, formation, RDV médecin"
            className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          />
        </div>

        {message && (
          <p
            role="status"
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {error}
          </p>
        )}

        <div className="flex justify-between items-center pt-2">
          {isEdit ? (
            confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.06em] bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {pending ? "…" : "Confirmer suppression ?"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                className="px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.06em] border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Supprimer
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pending ? "…" : isEdit ? "Modifier" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)] mb-1.5"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all ${
          error ? "border-[var(--color-danger)]/60" : "border-[var(--color-line)]"
        }`}
        style={{
          fontFamily: "var(--font-ui)",
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />
      {error && (
        <p
          className="mt-1 text-xs text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
