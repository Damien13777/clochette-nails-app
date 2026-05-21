"use client";

/**
 * Modale d'édition des horaires d'un jour.
 *
 * Deux modes :
 *  1. "Récurrent" — modifie les BusinessHours (s'applique à tous les jours
 *     de la semaine de même dayOfWeek, ex: tous les lundis).
 *  2. "Exception" — crée/modifie une DayException pour la date précise cliquée
 *     (s'applique uniquement à ce jour, override le récurrent).
 *
 * Si une exception existe déjà pour cette date, la modale s'ouvre par défaut
 * en mode "Exception" + permet la suppression pour revenir au récurrent.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteDayException,
  upsertBusinessHours,
  upsertDayException,
} from "@/lib/actions/calendar-admin";
import { DAY_LABELS_FULL_FR } from "@/lib/calendar";

export type DayExceptionInitial = {
  isOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  reason: string | null;
};

type Props = {
  dayOfWeek: number;
  /** Date précise cliquée (YYYY-MM-DD) — requise pour les exceptions */
  dateIso: string;
  /** Horaires récurrents de ce jour de semaine (BusinessHours) */
  initial: {
    isOpen: boolean;
    openingTime: string | null;
    closingTime: string | null;
    breakStart: string | null;
    breakEnd: string | null;
  };
  /** Exception existante pour cette date précise (si présente) */
  existingException?: DayExceptionInitial | null;
  onClose: () => void;
};

type Mode = "recurring" | "exception";

function formatDateFr(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function BusinessHoursModal({
  dayOfWeek,
  dateIso,
  initial,
  existingException,
  onClose,
}: Props) {
  const router = useRouter();
  // Par défaut : exception si déjà présente, sinon récurrent
  const [mode, setMode] = useState<Mode>(
    existingException ? "exception" : "recurring",
  );

  // Helper : retourne les valeurs initiales selon le mode courant
  function valuesForMode(m: Mode) {
    if (m === "exception" && existingException) {
      return {
        isOpen: existingException.isOpen,
        openingTime: existingException.openingTime ?? "09:00",
        closingTime: existingException.closingTime ?? "19:00",
        breakStart: existingException.breakStart ?? "12:30",
        breakEnd: existingException.breakEnd ?? "13:30",
        hasBreak: Boolean(
          existingException.breakStart && existingException.breakEnd,
        ),
        reason: existingException.reason ?? "",
      };
    }
    // Mode récurrent OU exception sans valeur existante
    return {
      isOpen: initial.isOpen,
      openingTime: initial.openingTime ?? "09:00",
      closingTime: initial.closingTime ?? "19:00",
      breakStart: initial.breakStart ?? "12:30",
      breakEnd: initial.breakEnd ?? "13:30",
      hasBreak: Boolean(initial.breakStart && initial.breakEnd),
      reason: "",
    };
  }

  const initialValues = valuesForMode(mode);
  const [isOpen, setIsOpen] = useState(initialValues.isOpen);
  const [openingTime, setOpeningTime] = useState(initialValues.openingTime);
  const [closingTime, setClosingTime] = useState(initialValues.closingTime);
  const [hasBreak, setHasBreak] = useState(initialValues.hasBreak);
  const [breakStart, setBreakStart] = useState(initialValues.breakStart);
  const [breakEnd, setBreakEnd] = useState(initialValues.breakEnd);
  const [reason, setReason] = useState(initialValues.reason);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ESC pour fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  /** Bascule le mode : re-charge les valeurs initiales correspondantes. */
  function switchMode(newMode: Mode) {
    if (newMode === mode) return;
    setMode(newMode);
    const v = valuesForMode(newMode);
    setIsOpen(v.isOpen);
    setOpeningTime(v.openingTime);
    setClosingTime(v.closingTime);
    setHasBreak(v.hasBreak);
    setBreakStart(v.breakStart);
    setBreakEnd(v.breakEnd);
    setReason(v.reason);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setConfirmingDelete(false);
  }

  function handleSubmit() {
    setError(null);
    setMessage(null);
    setFieldErrors({});
    startTransition(async () => {
      const common = {
        isOpen,
        openingTime: isOpen ? openingTime : null,
        closingTime: isOpen ? closingTime : null,
        breakStart: isOpen && hasBreak ? breakStart : null,
        breakEnd: isOpen && hasBreak ? breakEnd : null,
      };
      const res =
        mode === "recurring"
          ? await upsertBusinessHours({ dayOfWeek, ...common })
          : await upsertDayException({
              dateIso,
              ...common,
              reason: reason.trim() || null,
            });
      if (res.ok) {
        router.refresh();
        // Si message contient avertissement → afficher avant de fermer
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

  function handleDeleteException() {
    setError(null);
    startTransition(async () => {
      const res = await deleteDayException(dateIso);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  const hasExistingException = Boolean(existingException);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Horaires du ${DAY_LABELS_FULL_FR[dayOfWeek]}`}
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto flex items-start justify-center px-3 sm:px-4 py-6 sm:py-10"
      onClick={() => !pending && onClose()}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] w-full mx-auto p-5 sm:p-6 space-y-5 overflow-hidden box-border"
        style={{ maxWidth: "min(30rem, calc(100vw - 1.5rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Horaires
          </p>
          <h3
            className="text-lg mt-1 capitalize"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {mode === "recurring"
              ? `Tous les ${DAY_LABELS_FULL_FR[dayOfWeek].toLowerCase()}s`
              : formatDateFr(dateIso)}
          </h3>
        </div>

        {/* Toggle Récurrent / Exception */}
        <div
          role="tablist"
          aria-label="Mode d'application"
          className="flex gap-1 p-1 bg-[var(--color-bone)] rounded-full"
        >
          <ModeButton
            label={`Tous les ${DAY_LABELS_FULL_FR[dayOfWeek].toLowerCase()}s`}
            active={mode === "recurring"}
            onClick={() => switchMode("recurring")}
          />
          <ModeButton
            label={hasExistingException ? "Exception (active)" : "Seulement ce jour"}
            active={mode === "exception"}
            onClick={() => switchMode("exception")}
            highlight={hasExistingException}
          />
        </div>

        {mode === "exception" && (
          <p
            className="text-xs text-[var(--color-ink-500)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Ces horaires s&apos;appliqueront <strong>uniquement</strong> au {formatDateFr(dateIso)}.
            Les autres {DAY_LABELS_FULL_FR[dayOfWeek].toLowerCase()}s conserveront leurs
            horaires récurrents.
          </p>
        )}

        {/* Toggle open / closed */}
        <label className="flex items-center justify-between gap-4 p-3 bg-[var(--color-bone)] rounded-[var(--radius-sm)] cursor-pointer">
          <span
            className="text-sm text-[var(--color-ink-900)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Salon ouvert ce jour
          </span>
          <input
            type="checkbox"
            checked={isOpen}
            onChange={(e) => setIsOpen(e.target.checked)}
            disabled={pending}
            className="w-4 h-4 rounded text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
          />
        </label>

        {isOpen && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TimeField
                label="Ouverture"
                value={openingTime}
                onChange={setOpeningTime}
                disabled={pending}
                error={fieldErrors.openingTime}
              />
              <TimeField
                label="Fermeture"
                value={closingTime}
                onChange={setClosingTime}
                disabled={pending}
                error={fieldErrors.closingTime}
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasBreak}
                onChange={(e) => setHasBreak(e.target.checked)}
                disabled={pending}
                className="w-4 h-4 rounded text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
              />
              <span
                className="text-sm text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Pause déjeuner
              </span>
            </label>

            {hasBreak && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                <TimeField
                  label="Début pause"
                  value={breakStart}
                  onChange={setBreakStart}
                  disabled={pending}
                  error={fieldErrors.breakStart}
                />
                <TimeField
                  label="Fin pause"
                  value={breakEnd}
                  onChange={setBreakEnd}
                  disabled={pending}
                  error={fieldErrors.breakEnd}
                />
              </div>
            )}
          </>
        )}

        {/* Motif (uniquement en mode exception) */}
        {mode === "exception" && (
          <div>
            <label
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)] mb-1.5"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Motif{" "}
              <span className="text-[var(--color-ink-500)] normal-case tracking-normal">
                (interne, optionnel)
              </span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              maxLength={200}
              placeholder="Ex : férié rattrapé, formation, événement spécial"
              className="block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>
        )}

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

        <div className="flex justify-between items-center pt-2 gap-2 flex-wrap">
          {/* Bouton supprimer exception (uniquement si existante en mode exception) */}
          {mode === "exception" && hasExistingException ? (
            confirmingDelete ? (
              <button
                type="button"
                onClick={handleDeleteException}
                disabled={pending}
                className="px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.06em] bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {pending ? "…" : "Confirmer suppression ?"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.06em] border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
                title="Retour aux horaires récurrents pour cette date"
              >
                Supprimer l&apos;exception
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
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  label,
  active,
  onClick,
  highlight,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : highlight
            ? "text-[var(--color-violet-700)] hover:bg-[var(--color-paper)]"
            : "text-[var(--color-ink-700)] hover:bg-[var(--color-paper)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </button>
  );
}

function TimeField({
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
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)] mb-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </label>
      <input
        type="time"
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
