"use client";

/**
 * Modale d'édition admin d'un RDV (statuts AWAITING_DEPOSIT / CONFIRMED).
 *
 * Permet de corriger les coordonnées et de changer la prestation + options.
 * Le créneau (date/heure) n'est pas modifiable ici (→ « Déplacer »). La durée
 * et le montant estimé sont recalculés en live. Soumission → updateBookingDetails ;
 * si le serveur renvoie le code "OVERLAP", on affiche un avertissement + un bouton
 * « Appliquer quand même » (rappel avec force=true).
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  updateBookingDetails,
  type UpdateBookingDetailsResult,
} from "@/lib/actions/booking-admin";
import { formatCents, formatDuration } from "@/lib/booking-display";

export type EditableService = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
};

export type EditableOption = {
  id: string;
  title: string;
  applicableCategories: string[];
  addedDurationMinutes: number;
  addedPriceCents: number;
};

type Props = {
  bookingId: string;
  current: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    message: string;
    serviceId: string;
    optionIds: string[];
  };
  services: EditableService[];
  options: EditableOption[];
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

export function EditBookingDialog({
  bookingId,
  current,
  services,
  options,
  onCancel,
  onSuccess,
}: Props) {
  const [firstName, setFirstName] = useState(current.firstName);
  const [lastName, setLastName] = useState(current.lastName);
  const [email, setEmail] = useState(current.email);
  const [phone, setPhone] = useState(current.phone);
  const [message, setMessage] = useState(current.message);
  const [serviceId, setServiceId] = useState(current.serviceId);
  const [optionIds, setOptionIds] = useState<string[]>(current.optionIds);
  const [notifyClient, setNotifyClient] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [overlap, setOverlap] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Verrou du scroll de fond pendant que la modale est ouverte.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Options applicables à la catégorie de la prestation sélectionnée.
  const applicableOptions = useMemo(() => {
    if (!selectedService) return [];
    return options.filter((o) =>
      o.applicableCategories.includes(selectedService.category),
    );
  }, [options, selectedService]);

  const selectedOptions = useMemo(
    () => options.filter((o) => optionIds.includes(o.id)),
    [options, optionIds],
  );

  const totalDuration =
    (selectedService?.durationMinutes ?? 0) +
    selectedOptions.reduce((s, o) => s + o.addedDurationMinutes, 0);
  const totalPriceCents =
    (selectedService?.priceCents ?? 0) +
    selectedOptions.reduce((s, o) => s + o.addedPriceCents, 0);

  function handleServiceChange(id: string) {
    setServiceId(id);
    // Purge les options qui ne s'appliquent plus à la nouvelle catégorie.
    const next = services.find((s) => s.id === id);
    if (next) {
      setOptionIds((prev) =>
        prev.filter((oid) => {
          const opt = options.find((o) => o.id === oid);
          return opt?.applicableCategories.includes(next.category);
        }),
      );
    }
  }

  function toggleOption(id: string) {
    setOptionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(force: boolean) {
    setError(null);
    setFieldErrors({});
    if (!force) setOverlap(null);
    startTransition(async () => {
      const res: UpdateBookingDetailsResult = await updateBookingDetails(bookingId, {
        client: {
          firstName,
          lastName,
          email,
          phone,
          message: message.trim() || null,
        },
        serviceId,
        optionIds,
        force,
        notifyClient,
      });
      if (res.ok) {
        onSuccess(res.message);
        return;
      }
      if (res.code === "OVERLAP") {
        setOverlap(res.error);
        return;
      }
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      setError(res.error);
    });
  }

  const canSubmit =
    !isPending &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    serviceId.length > 0;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modifier la réservation"
      className="fixed inset-0 z-[60] bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
              Modifier la réservation
            </h3>
            <p
              className="text-xs text-[var(--color-ink-500)] mt-1"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Corrige les coordonnées et la prestation. Le créneau (date/heure)
              se change via « Déplacer ».
            </p>
          </div>

          {/* Coordonnées */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Prénom"
              required
              value={firstName}
              onChange={setFirstName}
              error={fieldErrors["client.firstName"]}
              disabled={isPending}
            />
            <Field
              label="Nom"
              required
              value={lastName}
              onChange={setLastName}
              error={fieldErrors["client.lastName"]}
              disabled={isPending}
            />
            <Field
              label="Email"
              type="email"
              required
              value={email}
              onChange={setEmail}
              error={fieldErrors["client.email"]}
              disabled={isPending}
            />
            <Field
              label="Téléphone"
              type="tel"
              required
              value={phone}
              onChange={setPhone}
              error={fieldErrors["client.phone"]}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-message"
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Message{" "}
              <span className="text-[var(--color-ink-500)] normal-case tracking-normal">
                (optionnel)
              </span>
            </label>
            <textarea
              id="edit-message"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isPending}
              className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>

          {/* Prestation */}
          <div className="space-y-1.5">
            <label
              htmlFor="edit-service"
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prestation <span className="text-[var(--color-danger)]">*</span>
            </label>
            <select
              id="edit-service"
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              disabled={isPending}
              className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} — {formatCents(s.priceCents)} · {formatDuration(s.durationMinutes)}
                </option>
              ))}
            </select>
          </div>

          {/* Options applicables */}
          {applicableOptions.length > 0 && (
            <div className="space-y-2">
              <p
                className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Options
              </p>
              <div className="space-y-1.5">
                {applicableOptions.map((o) => {
                  const checked = optionIds.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] cursor-pointer hover:bg-[var(--color-bone)] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOption(o.id)}
                          disabled={isPending}
                          className="accent-[var(--color-violet-600)]"
                        />
                        <span
                          className="text-sm"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {o.title}
                        </span>
                      </span>
                      <span
                        className="text-xs text-[var(--color-ink-500)] shrink-0"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        +{o.addedDurationMinutes} min · +{formatCents(o.addedPriceCents)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Récap recalculé */}
          <div
            className="flex justify-between items-baseline p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] border border-[var(--color-violet-100)] text-sm"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <span className="text-[var(--color-ink-700)]">
              {formatDuration(totalDuration)}
            </span>
            <span
              className="text-[var(--color-violet-700)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {totalPriceCents > 0 ? formatCents(totalPriceCents) : "Sur devis"}
            </span>
          </div>

          {/* Informer la cliente */}
          <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 accent-[var(--color-violet-600)]"
            />
            <span
              className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Informer la cliente par email (récap à jour)
            </span>
          </label>

          {overlap && (
            <div
              role="alert"
              className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30 space-y-2"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              <p>⚠ {overlap}</p>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-warning)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Appliquer quand même
              </button>
            </div>
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
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Portal vers <body> : la modale doit échapper à tout ancêtre qui crée un
  // containing block pour `position: fixed` (la topbar admin `backdrop-blur`
  // + le contenu confiné la masquaient sinon). Même pattern que photo-lightbox
  // et calendar-side-panel.
  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

function Field({
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  const id = `edit-field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
        style={{ fontFamily: "var(--font-ui)" }}
      />
      {error && (
        <p className="text-[11px] text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
