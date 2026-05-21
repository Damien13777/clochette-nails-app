/**
 * /ebooks/succes — Page de confirmation post-achat.
 *
 * Affichée après :
 *  - Stripe Checkout success (?p={purchaseId}&s={sessionId})
 *  - Achat 100% carte cadeau (?p={purchaseId})
 *
 * Affiche un récap. Le PDF est livré par email (le lien de téléchargement
 * direct n'est PAS affiché ici pour éviter qu'un partage d'URL succes ne
 * donne accès à l'ebook).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Achat confirmé — Clochette Nails",
  robots: { index: false, follow: false },
};

type SearchParams = { p?: string };

export default async function EbookSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { p: purchaseId } = await searchParams;

  let summary: {
    title: string;
    email: string;
    isPaid: boolean;
  } | null = null;

  if (purchaseId) {
    const purchase = await prisma.ebookPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        clientEmail: true,
        paymentStatus: true,
        ebook: { select: { title: true } },
      },
    });
    if (purchase) {
      summary = {
        title: purchase.ebook.title,
        email: purchase.clientEmail,
        isPaid: purchase.paymentStatus === "PAID",
      };
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
        <div className="max-w-[700px] mx-auto px-5 lg:px-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--color-success)]/15 grid place-items-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1
            className="text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Merci pour votre achat !
          </h1>

          {summary ? (
            <>
              <p
                className="text-base text-[var(--color-ink-700)] mb-2"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Votre ebook{" "}
                <strong className="text-[var(--color-violet-700)]">
                  « {summary.title} »
                </strong>{" "}
                est en route.
              </p>
              {summary.isPaid ? (
                <p
                  className="text-sm text-[var(--color-ink-500)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Le lien de téléchargement vient d&apos;être envoyé à{" "}
                  <strong>{summary.email}</strong>. Pensez à vérifier vos
                  spams si vous ne le voyez pas arriver dans quelques minutes.
                </p>
              ) : (
                <p
                  className="text-sm text-[var(--color-warning)] p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 inline-block"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Votre paiement est en cours de confirmation. Vous recevrez
                  l&apos;email dès qu&apos;il sera validé (quelques secondes
                  habituellement).
                </p>
              )}
            </>
          ) : (
            <p
              className="text-sm text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Le lien de téléchargement de votre ebook vient d&apos;être
              envoyé par email. Vérifiez votre boîte de réception (et vos
              spams) dans les prochaines minutes.
            </p>
          )}

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/ebooks"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Voir les autres ebooks
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Retour au site
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
