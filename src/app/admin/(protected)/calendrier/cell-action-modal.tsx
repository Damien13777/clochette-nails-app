"use client";

/**
 * Modale à 2 onglets, ouverte au clic sur une cellule vide du calendrier :
 *  - "+ Indispo" : créer une indisponibilité (vacances, RDV perso, etc.)
 *  - "+ RDV admin" : créer un rendez-vous client manuellement
 *
 * Pré-rempli avec la cellule cliquée (dateIso + startTime).
 *
 * Pour l'édition d'une indispo existante (clic bande bleue), on utilise toujours
 * UnavailabilityModal direct (single purpose).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUnavailability } from "@/lib/actions/calendar-admin";
import { BookingAdminForm } from "./booking-admin-form";

type Service = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
};

type Option = {
  id: string;
  title: string;
  addedDurationMinutes: number;
  addedPriceCents: number;
  applicableCategories: string[];
};

type Props = {
  /** YYYY-MM-DD */
  dateIso: string;
  /** HH:MM */
  startTime: string;
  services: Service[];
  options: Option[];
  onClose: () => void;
};

type TabKey = "unavailability" | "booking";

export function CellActionModal({
  dateIso,
  startTime,
  services,
  options,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("booking");

  // ESC pour fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Action sur le créneau"
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto flex items-start justify-center px-3 sm:px-4 py-6 sm:py-10"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] w-full mx-auto p-5 sm:p-6 overflow-hidden box-border"
        style={{ maxWidth: "min(36rem, calc(100vw - 1.5rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Type d'action"
          className="flex gap-1 p-1 bg-[var(--color-bone)] rounded-full mb-5"
        >
          <TabButton
            label="+ RDV admin"
            active={activeTab === "booking"}
            onClick={() => setActiveTab("booking")}
          />
          <TabButton
            label="+ Indispo"
            active={activeTab === "unavailability"}
            onClick={() => setActiveTab("unavailability")}
          />
        </div>

        {activeTab === "booking" ? (
          <BookingAdminForm
            defaultDate={dateIso}
            defaultStartTime={startTime}
            services={services}
            options={options}
            onClose={onClose}
          />
        ) : (
          <UnavailabilityFormInline
            dateIso={dateIso}
            startTime={startTime}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
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
          : "text-[var(--color-ink-700)] hover:bg-[var(--color-paper)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </button>
  );
}

// ─── Sous-form indispo inline (variante allégée du modal complet) ─────────

function UnavailabilityFormInline({
  dateIso,
  startTime,
  onClose,
}: {
  dateIso: string;
  startTime: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Heure de fin par défaut = +1h
  const [h, m] = startTime.split(":").map(Number);
  const endMin = h * 60 + m + 60;
  const endH = Math.min(23, Math.floor(endMin / 60));
  const endM = endMin % 60;
  const defaultEndTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const [startsAtLocal, setStartsAtLocal] = useState(`${dateIso}T${startTime}`);
  const [endsAtLocal, setEndsAtLocal] = useState(`${dateIso}T${defaultEndTime}`);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    setFieldErrors({});
    setMessage(null);
    startTransition(async () => {
      const res = await createUnavailability({
        startsAt: new Date(startsAtLocal),
        endsAt: new Date(endsAtLocal),
        reason: reason.trim() || undefined,
      });
      if (res.ok) {
        router.refresh();
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

  return (
    <div className="space-y-4">
      <p
        className="text-xs text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Bloque le créneau dans les disponibilités publiques (vacances,
        formation, RDV personnel, etc.).
      </p>

      <DateTimeInline
        label="Début"
        value={startsAtLocal}
        onChange={setStartsAtLocal}
        disabled={pending}
        error={fieldErrors.startsAt}
      />
      <DateTimeInline
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
          className="block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
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

      <div className="flex justify-end gap-2 pt-2">
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
          {pending ? "…" : "Créer l'indispo"}
        </button>
      </div>
    </div>
  );
}

function DateTimeInline({
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
        <p className="mt-1 text-xs text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
