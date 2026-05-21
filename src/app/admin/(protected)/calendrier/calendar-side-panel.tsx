"use client";

/**
 * Panneau latéral de gestion du calendrier.
 * Ouvert via le bouton "Gérer" du CalendarHeader.
 *
 * 3 sections :
 *  - Mois ouverts à la résa publique (BookableMonth)
 *  - Indispos récurrentes (RecurringUnavailability)
 *  - Indispos one-off à venir (Unavailability)
 *
 * Slide-in depuis la droite sur desktop, plein écran sur mobile.
 */

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createRecurringUnavailability,
  deleteRecurringUnavailability,
  toggleBookableMonth,
} from "@/lib/actions/calendar-admin";
import { DAY_LABELS_FULL_FR } from "@/lib/calendar";
import { todayIsoParis } from "@/lib/paris-day";

type BookableMonth = { year: number; month: number; isOpen: boolean };

type RecurringUnav = {
  id: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  startsFrom: string; // ISO
  endsAt: string | null;
  reason: string | null;
};

type UpcomingUnav = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

type Props = {
  bookableMonths: BookableMonth[];
  recurringUnavails: RecurringUnav[];
  upcomingUnavails: UpcomingUnav[];
  onClose: () => void;
};

const MONTH_LABELS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTimeFr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CalendarSidePanel({
  bookableMonths,
  recurringUnavails,
  upcomingUnavails,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);

  // ESC pour fermer + mount flag pour createPortal (évite SSR mismatch)
  useEffect(() => {
    setMounted(true);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  // Portal sur document.body → s'échappe du stacking context du parent (CalendarHeader sticky z-20)
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gestion du calendrier"
      className="fixed inset-0 z-[100] bg-black/40 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="absolute top-0 right-0 bottom-0 bg-[var(--color-paper)] overflow-y-auto shadow-xl flex flex-col"
        style={{ width: "min(480px, 100vw)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <header className="sticky top-0 z-10 bg-[var(--color-paper)] border-b border-[var(--color-line)] px-5 py-4 flex items-center justify-between">
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Calendrier
            </p>
            <h2
              className="text-lg mt-0.5"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Gestion avancée
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 px-5 py-5 space-y-8">
          <BookableMonthsSection months={bookableMonths} />
          <RecurringUnavailsSection items={recurringUnavails} />
          <UpcomingUnavailsSection items={upcomingUnavails} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Section : Mois ouverts ──────────────────────────────────

function BookableMonthsSection({ months }: { months: BookableMonth[] }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggle(year: number, month: number) {
    const key = `${year}-${month}`;
    setPendingKey(key);
    startTransition(async () => {
      const res = await toggleBookableMonth({ year, month });
      setPendingKey(null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section>
      <SectionTitle title="Mois ouverts à la réservation" />
      <p
        className="text-xs text-[var(--color-ink-500)] mb-4"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Active ou désactive la réservation publique pour un mois entier. Les RDV
        admin restent possibles même si le mois est fermé.
      </p>
      <ul className="space-y-1">
        {months.map((m) => {
          const key = `${m.year}-${m.month}`;
          const isPending = pendingKey === key;
          return (
            <li
              key={key}
              className="flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-bone)]/50 transition-colors"
            >
              <span
                className="text-sm text-[var(--color-ink-900)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {MONTH_LABELS_FR[m.month - 1]} {m.year}
              </span>
              <button
                type="button"
                onClick={() => handleToggle(m.year, m.month)}
                disabled={isPending}
                aria-pressed={m.isOpen}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  m.isOpen
                    ? "bg-[var(--color-violet-600)]"
                    : "bg-[var(--color-ink-300)]"
                } ${isPending ? "opacity-50" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150"
                  style={{ left: m.isOpen ? "22px" : "2px" }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Section : Indispos récurrentes ──────────────────────────

function RecurringUnavailsSection({ items }: { items: RecurringUnav[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteRecurringUnavailability(id);
      setDeletingId(null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section>
      <SectionTitle title="Indispos récurrentes" />
      <p
        className="text-xs text-[var(--color-ink-500)] mb-4"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Plages horaires bloquées chaque semaine sur un jour donné. Utile pour
        des pauses régulières en plus de la pause déjeuner.
      </p>

      {items.length === 0 ? (
        <p
          className="text-sm text-[var(--color-ink-500)] py-3 italic"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune indispo récurrente.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {items.map((u) => (
            <li
              key={u.id}
              className="p-3 bg-[var(--color-bone)]/50 border border-[var(--color-line)] rounded-[var(--radius-sm)]"
            >
              <p
                className="text-sm text-[var(--color-ink-900)] capitalize"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Tous les {DAY_LABELS_FULL_FR[u.dayOfWeek].toLowerCase()}s
                {u.startTime && u.endTime && (
                  <>
                    {" "}
                    · {u.startTime}–{u.endTime}
                  </>
                )}
              </p>
              <p
                className="text-xs text-[var(--color-ink-500)] mt-0.5"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Du {formatDateFr(u.startsFrom)}
                {u.endsAt ? ` au ${formatDateFr(u.endsAt)}` : " · sans fin"}
                {u.reason && ` · ${u.reason}`}
              </p>
              <button
                type="button"
                onClick={() => handleDelete(u.id)}
                disabled={deletingId === u.id}
                className="mt-2 text-[11px] uppercase tracking-[0.06em] text-[var(--color-danger)] hover:underline disabled:opacity-50"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {deletingId === u.id ? "…" : "Supprimer"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <RecurringUnavailForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full px-4 py-2.5 rounded-full border border-dashed border-[var(--color-violet-600)]/50 text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          + Ajouter une indispo récurrente
        </button>
      )}
    </section>
  );
}

function RecurringUnavailForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void;
}) {
  const today = todayIsoParis();
  const [dayOfWeek, setDayOfWeek] = useState(2); // Mardi par défaut
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [startsFrom, setStartsFrom] = useState(today);
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await createRecurringUnavailability({
        dayOfWeek,
        startTime,
        endTime,
        startsFrom,
        endsAt: endsAt || null,
        reason: reason.trim() || undefined,
      });
      if (res.ok) {
        onSaved();
      } else {
        setError(res.error);
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      }
    });
  }

  return (
    <div className="p-4 bg-[var(--color-paper)] border border-[var(--color-violet-600)]/30 rounded-[var(--radius-sm)] space-y-3">
      <p
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-violet-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Nouvelle indispo récurrente
      </p>

      <div>
        <Label>Jour de la semaine</Label>
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
          disabled={pending}
          className="mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {DAY_LABELS_FULL_FR.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TimeField
          label="Début"
          value={startTime}
          onChange={setStartTime}
          disabled={pending}
          error={fieldErrors.startTime}
        />
        <TimeField
          label="Fin"
          value={endTime}
          onChange={setEndTime}
          disabled={pending}
          error={fieldErrors.endTime}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DateField
          label="À partir du"
          value={startsFrom}
          onChange={setStartsFrom}
          disabled={pending}
          min={today}
          error={fieldErrors.startsFrom}
        />
        <DateField
          label="Jusqu'au (optionnel)"
          value={endsAt}
          onChange={setEndsAt}
          disabled={pending}
          min={startsFrom}
          error={fieldErrors.endsAt}
          hint="Laisser vide = sans fin"
        />
      </div>

      <div>
        <Label>Motif (optionnel)</Label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          maxLength={200}
          placeholder="Ex : pause yoga, cours d'aquarelle"
          className="mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
          style={{ fontFamily: "var(--font-ui)" }}
        />
      </div>

      {error && (
        <p
          role="alert"
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
          disabled={pending}
          className="px-3 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="px-3 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pending ? "…" : "Créer"}
        </button>
      </div>
    </div>
  );
}

// ─── Section : Indispos one-off à venir ─────────────────────

function UpcomingUnavailsSection({ items }: { items: UpcomingUnav[] }) {
  return (
    <section>
      <SectionTitle title="Indispos one-off à venir" />
      <p
        className="text-xs text-[var(--color-ink-500)] mb-4"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Indispos ponctuelles (vacances, formations, etc.). Création via clic sur
        une cellule du calendrier.
      </p>

      {items.length === 0 ? (
        <p
          className="text-sm text-[var(--color-ink-500)] py-3 italic"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune indispo à venir.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((u) => (
            <li
              key={u.id}
              className="p-3 bg-[#dbeafe]/40 border border-[#3b82f6]/30 rounded-[var(--radius-sm)]"
            >
              <p
                className="text-sm text-[var(--color-ink-900)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {formatDateTimeFr(u.startsAt)} → {formatDateTimeFr(u.endsAt)}
              </p>
              {u.reason && (
                <p
                  className="text-xs text-[var(--color-ink-500)] mt-0.5 italic"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {u.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Sous-composants ─────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <h3
      className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-2"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {title}
    </h3>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </label>
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
      <Label>{label}</Label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] ${
          error ? "border-[var(--color-danger)]/60" : "border-[var(--color-line)]"
        }`}
        style={{
          fontFamily: "var(--font-ui)",
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />
      {error && (
        <p className="mt-1 text-xs text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  disabled,
  min,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={min}
        className={`mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] ${
          error ? "border-[var(--color-danger)]/60" : "border-[var(--color-line)]"
        }`}
        style={{
          fontFamily: "var(--font-ui)",
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />
      {error ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
