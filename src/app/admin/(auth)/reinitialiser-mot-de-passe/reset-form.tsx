"use client";

/**
 * ResetForm — saisie du nouveau mot de passe.
 * Reçoit le token via prop (extrait depuis searchParams côté server).
 * Redirige vers /admin/connexion?reset=success après succès.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/lib/actions/password-reset";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Mot de passe : 8 caractères minimum.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    startTransition(async () => {
      const result = await resetPassword(token, password);
      if (result.ok) {
        router.push("/admin/connexion?reset=success");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    // action="javascript:void(0)" empêche le submit HTML natif (GET avec password
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
          htmlFor="password"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Nouveau mot de passe
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            className="w-full px-4 py-3 pr-12 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Masquer" : "Afficher"}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)] transition-colors"
          >
            {showPassword ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <p
          className="text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          8 caractères minimum.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirm-password"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="confirm-password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isPending}
          className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all"
          style={{ fontFamily: "var(--font-ui)" }}
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !password || !confirmPassword}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Mise à jour…" : "Définir le nouveau mot de passe"}
      </button>
    </form>
  );
}
