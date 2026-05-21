/**
 * /admin/reinitialiser-mot-de-passe?token=xxx — Définit un nouveau mot de passe.
 *
 * Server Component qui extrait le token depuis searchParams et le passe
 * au form Client. Si pas de token, affiche un message d'erreur direct
 * (le bouton "demander un nouveau lien" renvoie vers /mot-de-passe-oublie).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Réinitialiser le mot de passe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { token?: string };
type TokenState = "missing" | "invalid" | "expired" | "valid";

async function checkToken(token: string | undefined): Promise<TokenState> {
  if (!token || token.length < 32) return "missing";
  const record = await prisma.verificationToken.findUnique({
    where: { token },
    select: { expires: true },
  });
  if (!record) return "invalid";
  if (record.expires < new Date()) return "expired";
  return "valid";
}

const ERROR_MESSAGES: Record<Exclude<TokenState, "valid">, string> = {
  missing: "Lien de réinitialisation invalide ou manquant.",
  invalid:
    "Lien invalide ou déjà utilisé. Demandez un nouveau lien de réinitialisation.",
  expired:
    "Lien expiré (valable 1 heure). Demandez un nouveau lien de réinitialisation.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const state = await checkToken(token);

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
          Nouveau mot de passe
        </h1>
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mb-8"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {state === "valid"
            ? "Choisissez un nouveau mot de passe pour votre compte."
            : "Impossible d'utiliser ce lien."}
        </p>

        {state === "valid" ? (
          <ResetForm token={token!} />
        ) : (
          <div className="space-y-4">
            <p
              role="alert"
              className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              ⚠ {ERROR_MESSAGES[state]}
            </p>
            <Link
              href="/admin/mot-de-passe-oublie"
              className="w-full inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Demander un nouveau lien
            </Link>
          </div>
        )}

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
