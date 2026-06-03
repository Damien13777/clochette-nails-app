"use client";

/**
 * Step 4 — Formulaire client + soumission.
 *
 * Validation côté client minimale (HTML5 + types). Server Action revérifie tout via Zod.
 */

import type { ClientInfo } from "../reservation-flow";
import { GiftCardField } from "./gift-card-field";
import { PhotoUpload, type UploadedFile } from "./photo-upload";
import { RecaptchaNotice } from "@/components/recaptcha-notice";

type Props = {
  value: ClientInfo;
  onChange: (info: ClientInfo) => void;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  giftCardCode: string | null;
  onGiftCardChange: (code: string | null, amountCents: number) => void;
  photos: UploadedFile[];
  onPhotosChange: (files: UploadedFile[]) => void;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
  stripeConfigured: boolean;
  depositLabel: string;
};

export function ClientFormStep({
  value,
  onChange,
  consent,
  onConsentChange,
  giftCardCode: _giftCardCode,
  onGiftCardChange,
  photos,
  onPhotosChange,
  fieldErrors,
  onSubmit,
  isPending,
  stripeConfigured,
  depositLabel,
}: Props) {
  function update<K extends keyof ClientInfo>(field: K, val: ClientInfo[K]) {
    onChange({ ...value, [field]: val });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5 pt-4"
      noValidate
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          name="firstName"
          label="Prénom"
          required
          value={value.firstName}
          onChange={(v) => update("firstName", v)}
          error={fieldErrors["client.firstName"]}
          disabled={isPending}
          autoComplete="given-name"
        />
        <Field
          name="lastName"
          label="Nom"
          required
          value={value.lastName}
          onChange={(v) => update("lastName", v)}
          error={fieldErrors["client.lastName"]}
          disabled={isPending}
          autoComplete="family-name"
        />
      </div>

      <Field
        name="email"
        type="email"
        label="Email"
        required
        value={value.email}
        onChange={(v) => update("email", v)}
        error={fieldErrors["client.email"]}
        disabled={isPending}
        autoComplete="email"
      />

      <Field
        name="phone"
        type="tel"
        label="Téléphone"
        required
        value={value.phone}
        onChange={(v) => update("phone", v)}
        error={fieldErrors["client.phone"]}
        disabled={isPending}
        autoComplete="tel"
        placeholder="06 12 34 56 78"
      />

      <div className="space-y-1.5">
        <label
          htmlFor="message"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Message (optionnel)
        </label>
        <textarea
          id="message"
          rows={3}
          maxLength={500}
          value={value.message}
          onChange={(e) => update("message", e.target.value)}
          disabled={isPending}
          placeholder="Inspirations, couleurs, demandes particulières…"
          className="textarea w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all resize-y min-h-[6rem]"
        />
      </div>

      <PhotoUpload
        value={photos}
        onChange={onPhotosChange}
        disabled={isPending}
      />

      <GiftCardField
        onValidated={onGiftCardChange}
        disabled={isPending}
      />

      {/* Consentement */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsentChange(e.target.checked)}
          disabled={isPending}
          required
          className="mt-1 w-4 h-4 accent-[var(--color-violet-600)]"
        />
        <span
          className="text-xs text-[var(--color-ink-700)] leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          J&apos;accepte les{" "}
          <a
            href="/cgv"
            target="_blank"
            className="text-[var(--color-violet-700)] underline underline-offset-2"
          >
            conditions générales
          </a>{" "}
          et la{" "}
          <a
            href="/confidentialite"
            target="_blank"
            className="text-[var(--color-violet-700)] underline underline-offset-2"
          >
            politique de confidentialité
          </a>
          . L&apos;acompte versé est non remboursable au-delà de 72h avant le RDV.
        </span>
      </label>

      {/* Stripe info */}
      {!stripeConfigured && (
        <div
          className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 border border-[var(--color-warning)] text-xs text-[var(--color-warning)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <strong>Mode dev :</strong> Stripe non configuré, la réservation
          sera auto-confirmée sans paiement réel. Configure
          <code className="mx-1">STRIPE_SECRET_KEY</code> en prod.
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !consent}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[var(--color-violet-600)] text-white text-sm uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Traitement…" : depositLabel}
        {!isPending && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        )}
      </button>

      <RecaptchaNotice />
    </form>
  );
}

function Field({
  name,
  type = "text",
  label,
  required,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  placeholder,
}: {
  name: string;
  type?: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
        {required && (
          <span className="text-[var(--color-danger)] ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={!!error}
        className="input w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all"
      />
      {error && (
        <p
          className="field-error text-xs text-[var(--color-danger)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
