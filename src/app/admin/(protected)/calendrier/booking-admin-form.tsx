"use client";

/**
 * Form de création d'un RDV par l'admin via le calendrier.
 *
 * Sections :
 *  - Cliente (prénom, nom, email, téléphone, message)
 *  - Prestation (service + options + récap computed)
 *  - Paiement (3 modes : envoi lien / payé en physique / sans acompte)
 *  - Notes admin (optionnel)
 *
 * Validation côté serveur via createBookingAdmin (Zod).
 * Au succès : router.refresh() + close modal.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBookingAdmin } from "@/lib/actions/booking-admin";

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
  defaultDate: string; // YYYY-MM-DD
  defaultStartTime: string; // HH:MM
  services: Service[];
  options: Option[];
  onClose: () => void;
};

type PaymentMode = "SEND_LINK" | "PAID_IN_PERSON" | "NO_DEPOSIT";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  transfer: "Virement",
  check: "Chèque",
  card_terminal: "TPE / Carte bancaire",
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDateFr(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function BookingAdminForm({
  defaultDate,
  defaultStartTime,
  services,
  options,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Cliente
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  // Prestation
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [optionIds, setOptionIds] = useState<Set<string>>(new Set());

  // Paiement
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("SEND_LINK");
  const [paidInPersonMethod, setPaidInPersonMethod] = useState<string>("cash");
  // Montant en € (converti en centimes au submit)
  const [paidInPersonAmountEur, setPaidInPersonAmountEur] = useState<string>("");

  // Notes admin
  const [adminNotes, setAdminNotes] = useState("");

  // Erreurs serveur
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Options applicables = celles qui ont la catégorie du service choisi
  const applicableOptions = useMemo(() => {
    if (!selectedService) return [];
    return options.filter((o) =>
      o.applicableCategories.includes(selectedService.category),
    );
  }, [options, selectedService]);

  const selectedOptions = useMemo(
    () => applicableOptions.filter((o) => optionIds.has(o.id)),
    [applicableOptions, optionIds],
  );

  const totalDurationMinutes = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.durationMinutes +
      selectedOptions.reduce((sum, o) => sum + o.addedDurationMinutes, 0)
    );
  }, [selectedService, selectedOptions]);

  const totalPriceCents = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.priceCents +
      selectedOptions.reduce((sum, o) => sum + o.addedPriceCents, 0)
    );
  }, [selectedService, selectedOptions]);

  // Acompte standard = 30 % du total (fallback front, le serveur recalcule)
  const computedDepositCents = useMemo(
    () => Math.round(totalPriceCents * 0.3),
    [totalPriceCents],
  );

  const endTime = useMemo(
    () =>
      totalDurationMinutes > 0
        ? addMinutesToTime(defaultStartTime, totalDurationMinutes)
        : defaultStartTime,
    [defaultStartTime, totalDurationMinutes],
  );

  // Quand on change de service, on enlève les options qui ne s'appliquent plus
  function handleServiceChange(newServiceId: string) {
    setServiceId(newServiceId);
    const newService = services.find((s) => s.id === newServiceId);
    if (!newService) return;
    const validOptionIds = new Set(
      options
        .filter((o) => o.applicableCategories.includes(newService.category))
        .map((o) => o.id),
    );
    setOptionIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validOptionIds.has(id)) next.add(id);
      }
      return next;
    });
  }

  function toggleOption(id: string) {
    setOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    setFieldErrors({});
    if (!selectedService) {
      setError("Sélectionnez une prestation.");
      return;
    }
    startTransition(async () => {
      const paidInPersonAmountCents =
        paymentMode === "PAID_IN_PERSON"
          ? Math.round(parseFloat(paidInPersonAmountEur.replace(",", ".")) * 100) || 0
          : undefined;

      const res = await createBookingAdmin({
        client: {
          firstName,
          lastName,
          email,
          phone,
          message: message.trim() || null,
        },
        serviceId,
        optionIds: Array.from(optionIds),
        date: defaultDate,
        startTime: defaultStartTime,
        paymentMode,
        paidInPersonAmountCents,
        paidInPersonMethod:
          paymentMode === "PAID_IN_PERSON"
            ? (paidInPersonMethod as "cash" | "transfer" | "check" | "card_terminal")
            : undefined,
        adminNotes: adminNotes.trim() || null,
      });

      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Cliente ───────────────────────────────────── */}
      <Section title="Cliente">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Prénom"
            required
            value={firstName}
            onChange={setFirstName}
            disabled={pending}
            error={fieldErrors["client.firstName"]}
            autoComplete="given-name"
          />
          <Field
            label="Nom"
            required
            value={lastName}
            onChange={setLastName}
            disabled={pending}
            error={fieldErrors["client.lastName"]}
            autoComplete="family-name"
          />
        </div>
        <Field
          label="Email"
          required
          type="email"
          value={email}
          onChange={setEmail}
          disabled={pending}
          error={fieldErrors["client.email"]}
          autoComplete="email"
          inputMode="email"
        />
        <Field
          label="Téléphone"
          required
          value={phone}
          onChange={setPhone}
          disabled={pending}
          error={fieldErrors["client.phone"]}
          autoComplete="tel"
          inputMode="tel"
          placeholder="06 88 68 66 99"
        />
        <Textarea
          label="Message de la cliente (optionnel)"
          value={message}
          onChange={setMessage}
          disabled={pending}
          rows={2}
          maxLength={2000}
        />
      </Section>

      {/* ── Prestation ────────────────────────────────── */}
      <Section title="Prestation">
        <div className="bg-[var(--color-bone)] rounded-[var(--radius-sm)] px-3 py-2 text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          <span className="text-[var(--color-ink-500)]">Date · </span>
          <span className="text-[var(--color-ink-900)] capitalize">
            {formatDateFr(defaultDate)}
          </span>
          <span className="text-[var(--color-ink-500)]"> · Début · </span>
          <span className="text-[var(--color-ink-900)] font-medium">
            {defaultStartTime}
          </span>
        </div>

        <SelectField
          label="Service"
          required
          value={serviceId}
          onChange={handleServiceChange}
          disabled={pending}
          options={services.map((s) => ({
            value: s.id,
            label: `${s.title} (${formatDuration(s.durationMinutes)} · ${formatCents(s.priceCents)})`,
          }))}
          error={fieldErrors["serviceId"]}
        />

        {applicableOptions.length > 0 && (
          <div>
            <Label>Options (optionnel)</Label>
            <div className="space-y-2 mt-1.5">
              {applicableOptions.map((o) => (
                <label
                  key={o.id}
                  className="flex items-start gap-3 p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-line)] hover:bg-[var(--color-bone)]/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={optionIds.has(o.id)}
                    onChange={() => toggleOption(o.id)}
                    disabled={pending}
                    className="mt-0.5 w-4 h-4 rounded text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
                  />
                  <span className="flex-1 min-w-0">
                    <span
                      className="block text-sm text-[var(--color-ink-900)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {o.title}
                    </span>
                    <span
                      className="block text-[11px] text-[var(--color-ink-500)] mt-0.5"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      +{formatDuration(o.addedDurationMinutes)} · +{formatCents(o.addedPriceCents)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {selectedService && (
          <div className="bg-[var(--color-violet-50)] border border-[var(--color-violet-600)]/20 rounded-[var(--radius-sm)] p-3 text-sm space-y-1" style={{ fontFamily: "var(--font-ui)" }}>
            <div className="flex justify-between">
              <span className="text-[var(--color-ink-700)]">Horaire</span>
              <span className="text-[var(--color-ink-900)] font-medium">
                {defaultStartTime} – {endTime}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-ink-700)]">Durée totale</span>
              <span className="text-[var(--color-ink-900)] font-medium">
                {formatDuration(totalDurationMinutes)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-ink-700)]">Prix total</span>
              <span className="text-[var(--color-ink-900)] font-medium">
                {formatCents(totalPriceCents)}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[var(--color-violet-600)]/20">
              <span className="text-[var(--color-violet-700)] font-medium">Acompte 30%</span>
              <span className="text-[var(--color-violet-700)] font-semibold">
                {formatCents(computedDepositCents)}
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* ── Paiement ──────────────────────────────────── */}
      <Section title="Paiement">
        <PaymentModeOption
          mode="SEND_LINK"
          current={paymentMode}
          onSelect={setPaymentMode}
          disabled={pending}
          icon="💳"
          title="Envoyer le lien de paiement"
          description={`Email envoyé à ${email || "la cliente"}, lien Stripe valable 24h.`}
        />
        <PaymentModeOption
          mode="PAID_IN_PERSON"
          current={paymentMode}
          onSelect={setPaymentMode}
          disabled={pending}
          icon="💵"
          title="Acompte payé en main propre"
          description="Espèces, virement, chèque ou TPE."
        />
        {paymentMode === "PAID_IN_PERSON" && (
          <div className="ml-7 pl-4 border-l-2 border-[var(--color-violet-600)]/30 space-y-3">
            <SelectField
              label="Méthode"
              required
              value={paidInPersonMethod}
              onChange={setPaidInPersonMethod}
              disabled={pending}
              options={Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
              error={fieldErrors["paidInPersonMethod"]}
            />
            <Field
              label="Montant reçu (€)"
              required
              type="number"
              value={paidInPersonAmountEur}
              onChange={setPaidInPersonAmountEur}
              disabled={pending}
              inputMode="decimal"
              placeholder={(computedDepositCents / 100).toFixed(2)}
              error={fieldErrors["paidInPersonAmountCents"]}
              hint={`Acompte recommandé : ${formatCents(computedDepositCents)}. Vous pouvez ajuster.`}
            />
          </div>
        )}
        <PaymentModeOption
          mode="NO_DEPOSIT"
          current={paymentMode}
          onSelect={setPaymentMode}
          disabled={pending}
          icon="⭕"
          title="Sans acompte"
          description="RDV confirmé directement, aucun acompte demandé."
          tone="warning"
        />
      </Section>

      {/* ── Notes admin ──────────────────────────────── */}
      <Section title="Notes internes (optionnel)">
        <Textarea
          label="Visible uniquement par toi"
          value={adminNotes}
          onChange={setAdminNotes}
          disabled={pending}
          rows={2}
          maxLength={5000}
          placeholder="Ex : allergie au vernis Essie, paiement en attente du virement, etc."
        />
      </Section>

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
          disabled={pending || !selectedService}
          className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pending ? "Création…" : "Créer le RDV"}
        </button>
      </div>
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
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

function Field({
  label,
  required,
  value,
  onChange,
  disabled,
  type = "text",
  placeholder,
  inputMode,
  autoComplete,
  error,
  hint,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  inputMode?: "tel" | "numeric" | "decimal" | "email" | "text";
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-[var(--color-danger)] ml-1">*</span>}
      </Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        className={`mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all ${
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

function SelectField({
  label,
  required,
  value,
  onChange,
  disabled,
  options,
  error,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-[var(--color-danger)] ml-1">*</span>}
      </Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all ${
          error ? "border-[var(--color-danger)]/60" : "border-[var(--color-line)]"
        }`}
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-xs text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1.5 block w-full min-w-0 max-w-full box-border px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y"
        style={{ fontFamily: "var(--font-ui)" }}
      />
    </div>
  );
}

function PaymentModeOption({
  mode,
  current,
  onSelect,
  disabled,
  icon,
  title,
  description,
  tone = "default",
}: {
  mode: PaymentMode;
  current: PaymentMode;
  onSelect: (m: PaymentMode) => void;
  disabled?: boolean;
  icon: string;
  title: string;
  description: string;
  tone?: "default" | "warning";
}) {
  const active = current === mode;
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors ${
        active
          ? tone === "warning"
            ? "bg-[var(--color-warning)]/10 border-[var(--color-warning)]/40"
            : "bg-[var(--color-violet-50)] border-[var(--color-violet-600)]/40"
          : "bg-[var(--color-paper)] border-[var(--color-line)] hover:bg-[var(--color-bone)]/50"
      }`}
    >
      <input
        type="radio"
        name="paymentMode"
        checked={active}
        onChange={() => onSelect(mode)}
        disabled={disabled}
        className="mt-0.5 w-4 h-4 text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
      />
      <span className="flex-1 min-w-0">
        <span
          className="block text-sm text-[var(--color-ink-900)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <span className="mr-1.5">{icon}</span>
          {title}
        </span>
        <span
          className="block text-[11px] text-[var(--color-ink-500)] mt-0.5 break-words"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {description}
        </span>
      </span>
    </label>
  );
}
