"use client";

/**
 * ContactForm — Client Component avec useActionState.
 * Branché sur submitContactAction (Server Action).
 */

import { useActionState } from "react";
import { submitContactAction, type ContactState } from "@/lib/actions/contact";

export function ContactForm() {
  const [state, formAction, isPending] = useActionState<
    ContactState | null,
    FormData
  >(submitContactAction, null);

  if (state?.ok) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="p-4 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] border border-[var(--color-violet-100)] text-center"
      >
        <p className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          Merci, votre message est bien reçu.
        </p>
        <p
          className="text-sm text-[var(--color-ink-500)] mt-2"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Je reviens vers vous sous 24 h.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          name="name"
          label="Nom"
          required
          error={state?.fieldErrors?.name}
          defaultValue={state?.values?.name}
        />
        <Field
          name="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          error={state?.fieldErrors?.email}
          defaultValue={state?.values?.email}
        />
      </div>

      <Field
        name="phone"
        label="Téléphone (optionnel)"
        type="tel"
        autoComplete="tel"
        error={state?.fieldErrors?.phone}
        defaultValue={state?.values?.phone}
      />

      <Field
        name="subject"
        label="Sujet (optionnel)"
        error={state?.fieldErrors?.subject}
        defaultValue={state?.values?.subject}
      />

      <div className="space-y-1.5">
        <label
          htmlFor="message"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Message <span className="text-[var(--color-danger)]">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          disabled={isPending}
          defaultValue={state?.values?.message ?? ""}
          className="textarea w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all resize-y min-h-[7rem]"
          placeholder="Votre message…"
          aria-invalid={!!state?.fieldErrors?.message}
        />
        {state?.fieldErrors?.message && (
          <p
            className="field-error text-xs text-[var(--color-danger)]"
            role="alert"
          >
            {state.fieldErrors.message}
          </p>
        )}
      </div>

      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none -z-10"
        style={{ left: "-9999px" }}
      />

      {state?.error && state.code !== "VALIDATION_ERROR" && (
        <div
          role="alert"
          className="p-3 rounded-[var(--radius-sm)] bg-[rgba(178,58,74,0.06)] border border-[var(--color-danger)] text-[var(--color-danger)] text-sm"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Envoi…" : "Envoyer le message"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
  error,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  defaultValue?: string;
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
        autoComplete={autoComplete}
        defaultValue={defaultValue ?? ""}
        className="input w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
        aria-invalid={!!error}
      />
      {error && (
        <p className="field-error text-xs text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
