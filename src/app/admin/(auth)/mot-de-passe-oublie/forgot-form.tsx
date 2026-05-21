"use client";

/**
 * ForgotForm — saisie email pour recevoir un lien de reset.
 * Réponse générique (success quel que soit le résultat) pour éviter
 * l'énumération des comptes admin.
 */

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/lib/actions/password-reset";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (result.ok) {
        setSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (submitted) {
    return (
      <div
        role="status"
        className="p-4 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 text-sm text-[var(--color-success)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <p className="font-medium mb-2">✓ Demande prise en compte</p>
        <p className="text-[var(--color-ink-700)]">
          Si un compte admin existe avec cette adresse, un lien de
          réinitialisation y a été envoyé. Le lien expire dans 1 heure.
        </p>
        <p className="text-[var(--color-ink-500)] mt-3 text-xs">
          Vérifiez vos spams si rien ne vous arrive sous 5 minutes.
        </p>
      </div>
    );
  }

  return (
    // action="javascript:void(0)" empêche le submit HTML natif (GET avec email
    // en URL) si l'utilisateur tape avant l'hydration React.
    <form
      onSubmit={handleSubmit}
      action="javascript:void(0)"
      className="space-y-5"
      noValidate
    >
      {error && (
        <p
          role="alert"
          className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Adresse email du compte admin
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          placeholder="contact@clochette-nails.fr"
          className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all"
          style={{ fontFamily: "var(--font-ui)" }}
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !email}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Envoi en cours…" : "Recevoir le lien"}
        {!isPending && (
          <svg
            width="14"
            height="14"
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
    </form>
  );
}
