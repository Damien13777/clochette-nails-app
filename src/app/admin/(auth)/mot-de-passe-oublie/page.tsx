/**
 * /admin/mot-de-passe-oublie — Demande de réinitialisation.
 *
 * Server shell + Client form. Whitelistée dans le proxy NextAuth.
 * Pas indexée (noindex), c'est une page utilitaire.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-cream)]">
      <div className="w-full max-w-[440px] bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-8 md:p-12">
        <div className="flex justify-center mb-6">
          <div
            className="w-12 h-12 rounded-full bg-[var(--color-violet-600)] grid place-items-center text-white text-lg shadow-[var(--shadow-md)]"
            style={{ fontFamily: "var(--font-serif)" }}
            aria-hidden="true"
          >
            C
          </div>
        </div>

        <p
          className="text-center text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Espace administration
        </p>
        <h1
          className="text-center text-2xl mb-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Mot de passe oublié
        </h1>
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mb-8"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Saisissez votre email pour recevoir un lien de réinitialisation
          (valable 1 heure).
        </p>

        <ForgotForm />

        <p
          className="mt-6 text-center text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <Link
            href="/admin/connexion"
            className="text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] underline underline-offset-2"
          >
            ← Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
