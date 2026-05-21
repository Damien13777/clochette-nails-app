/**
 * Page de connexion admin — /admin/connexion
 *
 * Premier passage en Phase 1 : form basique avec NextAuth `signIn`,
 * sans encore le polish visuel complet de la maquette
 * (`design/admin-login-v1/AdminLogin.html`).
 *
 * Pattern : Server Component shell + Client Component <LoginForm>.
 */

import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion",
};

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-cream)]">
      <div className="w-full max-w-[440px] bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-8 md:p-12">
        {/* Logo monogramme */}
        <div className="flex justify-center mb-6">
          <div
            className="w-12 h-12 rounded-full bg-[var(--color-violet-600)] grid place-items-center text-white text-lg shadow-[var(--shadow-md)]"
            style={{ fontFamily: "var(--font-serif)" }}
            aria-hidden="true"
          >
            C
          </div>
        </div>

        {/* Eyebrow + titre */}
        <p
          className="text-center text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Espace administration
        </p>
        <h1 className="text-center text-2xl mb-2" style={{ fontFamily: "var(--font-serif)" }}>
          Bienvenue
        </h1>
        <p className="text-center text-sm text-[var(--color-ink-500)] mb-8">
          Connectez-vous pour gérer le salon.
        </p>

        <LoginForm searchParams={searchParams} />
      </div>
    </main>
  );
}
