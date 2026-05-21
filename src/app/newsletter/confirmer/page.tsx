/**
 * Page /newsletter/confirmer?token=…
 *
 * Étape 2 du DOI : la cliente clique sur le lien dans son email
 * → confirmation côté serveur, envoi mail welcome, notif admin.
 *
 * Server Component qui exécute la confirmation au chargement.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { confirmSubscription } from "@/lib/actions/newsletter";

export const metadata: Metadata = {
  title: "Confirmation newsletter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { token?: string };

export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const result = await confirmSubscription(token ?? "");

  return (
    <main className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10 text-center">
        {result.ok ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-6 bg-[#2d8659]/15 text-[#1d6b48]">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p
              className="text-xs uppercase tracking-[0.22em] text-[#1d6b48]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {result.alreadyConfirmed
                ? "Vous êtes déjà inscrite"
                : "Inscription confirmée"}
            </p>
            <h1
              className="text-2xl mt-3 mb-4"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {result.alreadyConfirmed
                ? "Aucune action nécessaire"
                : "Merci de votre confiance !"}
            </h1>
            <p
              className="text-sm text-[var(--color-ink-700)] mb-6"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {result.alreadyConfirmed
                ? `L'adresse ${result.email} est déjà inscrite à notre newsletter. Vous recevrez nos prochaines actualités.`
                : `Votre inscription à la newsletter est désormais active. Un email de bienvenue vient de vous être envoyé.`}
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
            <p
              className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Confirmation impossible
            </p>
            <h1
              className="text-2xl mt-3 mb-4"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Lien invalide ou expiré
            </h1>
            <p
              className="text-sm text-[var(--color-ink-500)] mb-6"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {result.error}
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
