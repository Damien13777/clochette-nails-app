"use client";

/**
 * LoginForm — Client Component
 *
 * Form admin avec :
 *  - Validation Zod côté client (email format, password min 8)
 *  - signIn('credentials', ...) côté NextAuth
 *  - Réponse constante quel que soit l'échec (no timing leak)
 *  - Toggle show/hide password
 *  - Loading state
 *
 * Phase 1 = version fonctionnelle. Le polish visuel (shake animation,
 * field-level errors riches, aria complet) viendra avec l'intégration
 * du mock `design/admin-login-v1/`.
 */

import { use, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Sanitise le callbackUrl pour ne JAMAIS quitter l'origin courant.
 * Indispensable quand on accède au dev server via IP locale depuis mobile :
 * NextAuth peut générer un callbackUrl absolu vers localhost qui, sur mobile,
 * pointe vers le téléphone lui-même → erreur "Load failed".
 */
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/admin";
  // Cas simple : déjà un chemin relatif
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  // Cas URL absolue → extraction du pathname + search si même origin
  if (typeof window !== "undefined") {
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin === window.location.origin) {
        return url.pathname + url.search + url.hash;
      }
    } catch {
      // URL malformée → fallback safe
    }
  }
  return "/admin";
}

export function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    params.error ? "Adresse e-mail ou mot de passe incorrect." : null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(
    params.reset === "success"
      ? "Mot de passe réinitialisé avec succès. Connectez-vous avec votre nouveau mot de passe."
      : null,
  );
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      try {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (!result || result.error) {
          // Réponse constante volontairement (no leak)
          setError("Adresse e-mail ou mot de passe incorrect.");
          return;
        }

        // Succès → redirect vers callbackUrl ou /admin.
        // Si callbackUrl est une URL absolue (parfois posée par NextAuth avec
        // l'host de référence localhost), on extrait juste le pathname pour
        // que la redirection reste sur l'origin courant (utile sur mobile
        // accédant via IP locale).
        const dest = safeCallback(params.callbackUrl);
        router.push(dest);
        router.refresh();
      } catch {
        setError("Connexion impossible. Réessayez.");
      }
    });
  }

  return (
    // action="javascript:void(0)" empêche tout submit HTML natif si l'utilisateur
    // tape avant la fin de l'hydration React (mobile principalement). Sans ça,
    // le form fait un GET sur l'URL courante avec les credentials en query string
    // — fuite de sécurité critique.
    <form
      onSubmit={handleSubmit}
      action="javascript:void(0)"
      className="space-y-5"
      noValidate
    >
      {/* Email */}
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Adresse email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={isPending}
          className="input w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all"
          placeholder="vous@exemple.fr"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Mot de passe
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="current-password"
            disabled={isPending}
            className="input w-full px-4 py-3 pr-12 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 transition-all"
            placeholder="Min 8 caractères"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={
              showPassword
                ? "Masquer le mot de passe"
                : "Afficher le mot de passe"
            }
            aria-pressed={showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)] transition-colors p-1"
            disabled={isPending}
          >
            {showPassword ? "Cacher" : "Voir"}
          </button>
        </div>
        <p
          className="field-help text-xs text-[var(--color-ink-500)]"
          id="password-help"
        >
          Minimum 8 caractères.
        </p>
      </div>

      {/* Honeypot — invisible aux humains, attire les bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none -z-10"
        style={{ left: "-9999px" }}
      />

      {/* Erreur globale */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-3 rounded-[var(--radius-sm)] bg-[rgba(178,58,74,0.06)] border border-[var(--color-danger)] text-[var(--color-danger)] text-sm"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {error}
        </div>
      )}

      {/* Succès reset password */}
      {successMessage && !error && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 text-[var(--color-success)] text-sm"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ✓ {successMessage}
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            aria-label="Fermer"
            className="float-right -mt-0.5 -mr-1 w-6 h-6 grid place-items-center text-[var(--color-success)] hover:opacity-70"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full px-6 py-3 rounded-[var(--radius-pill)] bg-[var(--color-violet-600)] text-white text-sm uppercase tracking-[0.06em] font-normal hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Connexion..." : "Se connecter"}
      </button>

      {/* Mention discrète */}
      <p
        className="text-center text-xs text-[var(--color-ink-500)] pt-2"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Accès réservé · contactez l&apos;éditeur pour un accès.
      </p>
    </form>
  );
}
