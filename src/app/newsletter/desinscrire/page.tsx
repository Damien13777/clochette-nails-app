/**
 * Page /newsletter/desinscrire?token=…
 *
 * Désinscription en un clic (lien unsubscribe dans chaque mail newsletter).
 * Pas de double validation : le clic vaut consentement à se désinscrire.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeNewsletter } from "@/lib/actions/newsletter";

export const metadata: Metadata = {
  title: "Désinscription newsletter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { token?: string };

export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const result = await unsubscribeNewsletter(token ?? "");

  return (
    <main className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10 text-center">
        {result.ok ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-6 bg-[var(--color-ink-500)]/15 text-[var(--color-ink-700)]">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Désinscription effectuée
            </p>
            <h1
              className="text-2xl mt-3 mb-4"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Vous ne recevrez plus nos emails
            </h1>
            <p
              className="text-sm text-[var(--color-ink-700)] mb-6"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              L&apos;adresse <strong>{result.email}</strong> a bien été retirée de
              notre liste de diffusion. Aucun email commercial ne vous sera plus
              envoyé.
            </p>
            <p
              className="text-xs text-[var(--color-ink-500)] mb-6"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Si vous souhaitez vous réinscrire plus tard, vous pourrez le faire
              depuis le pied de page du site.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Retour à l&apos;accueil
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-6 bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <h1
              className="text-2xl mb-4"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Lien invalide
            </h1>
            <p
              className="text-sm text-[var(--color-ink-500)] mb-6"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {result.error} Vous pouvez nous contacter directement pour toute
              demande de désinscription.
            </p>
            <Link
              href="/#contact"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Nous contacter
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
