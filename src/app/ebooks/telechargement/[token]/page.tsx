/**
 * /ebooks/telechargement/[token] — Page intermédiaire entre l'email et
 * l'API de téléchargement.
 *
 * Cette page inspecte le token (sans incrémenter le compteur) et présente
 * soit un bouton "Télécharger" propre, soit un message d'erreur friendly.
 * Le compteur n'est incrémenté que quand la cliente clique réellement sur
 * le bouton (qui pointe vers l'API).
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  MAX_DOWNLOADS_PER_TOKEN,
  type TokenReason,
  inspectDownloadToken,
} from "@/lib/ebook-download-token";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Téléchargement de votre ebook — Clochette Nails",
  robots: { index: false, follow: false },
};

const CONTACT_EMAIL = "contact@clochette-nails.fr";

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await inspectDownloadToken(token);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
        <div className="max-w-[640px] mx-auto px-5 lg:px-8">
          {result.ok ? (
            <DownloadCard
              token={token}
              ebookTitle={result.purchase.ebook.title}
              ebookShortDesc={result.purchase.ebook.shortDesc}
              coverImage={result.purchase.ebook.coverImage}
              coverImageAlt={result.purchase.ebook.coverImageAlt}
              downloadCount={result.purchase.downloadCount}
              tokenExpiresAt={result.purchase.tokenExpiresAt}
            />
          ) : (
            <ErrorCard reason={result.reason} />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function DownloadCard(props: {
  token: string;
  ebookTitle: string;
  ebookShortDesc: string;
  coverImage: string | null;
  coverImageAlt: string | null;
  downloadCount: number;
  tokenExpiresAt: Date;
}) {
  const remaining = Math.max(
    0,
    MAX_DOWNLOADS_PER_TOKEN - props.downloadCount,
  );
  const expiryFr = props.tokenExpiresAt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 text-center space-y-6">
      <p
        className="text-xs uppercase tracking-[0.22em] text-[var(--color-violet-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Votre ebook
      </p>

      {props.coverImage && (
        <div className="mx-auto w-32 aspect-[4/5] rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] bg-[var(--color-bone)]">
          <Image
            src={props.coverImage}
            alt={props.coverImageAlt ?? props.ebookTitle}
            width={200}
            height={250}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div>
        <h1
          className="text-[clamp(1.5rem,3vw,2rem)] leading-tight text-[var(--color-ink-900)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {props.ebookTitle}
        </h1>
        <p
          className="mt-3 text-sm text-[var(--color-ink-500)] leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {props.ebookShortDesc}
        </p>
      </div>

      <a
        href={`/api/v1/ebooks/download/${props.token}`}
        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[var(--color-violet-600)] text-white text-sm uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Télécharger le PDF
      </a>

      <p
        className="text-xs text-[var(--color-ink-500)] leading-relaxed"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Lien valide jusqu&apos;au <strong>{expiryFr}</strong>
        {" · "}
        Il vous reste <strong>{remaining}</strong> téléchargement{remaining > 1 ? "s" : ""} sur {MAX_DOWNLOADS_PER_TOKEN}
      </p>

      <p
        className="text-[11px] text-[var(--color-ink-500)] pt-4 border-t border-[var(--color-line)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Conservez l&apos;email reçu pour pouvoir revenir sur cette page jusqu&apos;à expiration.
      </p>
    </div>
  );
}

function ErrorCard({ reason }: { reason: TokenReason }) {
  const info = ERROR_MESSAGES[reason];

  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 text-center space-y-6">
      <div
        className="w-16 h-16 mx-auto rounded-full grid place-items-center"
        style={{ background: "var(--color-warning)15" }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-warning)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16" x2="12" y2="16.01" />
        </svg>
      </div>

      <div className="space-y-2">
        <h1
          className="text-[clamp(1.5rem,3vw,2rem)] leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {info.title}
        </h1>
        <p
          className="text-sm text-[var(--color-ink-700)] leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {info.body}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Lien de téléchargement ebook")}`}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Nous contacter
        </a>
        <Link
          href="/ebooks"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Voir nos ebooks
        </Link>
      </div>
    </div>
  );
}

const ERROR_MESSAGES: Record<TokenReason, { title: string; body: string }> = {
  NOT_FOUND: {
    title: "Lien de téléchargement invalide",
    body: "Ce lien ne correspond à aucun achat. Vérifiez que vous avez bien cliqué sur le lien complet reçu par email.",
  },
  EXPIRED: {
    title: "Ce lien a expiré",
    body: "Pour des raisons de sécurité, les liens de téléchargement expirent après 30 jours. Écrivez-nous : nous vous renverrons votre ebook.",
  },
  NOT_PAID: {
    title: "Paiement non confirmé",
    body: "Votre achat n'a pas encore été confirmé. Si vous venez de payer, patientez quelques minutes et rechargez la page. Sinon, contactez-nous.",
  },
  NO_PDF: {
    title: "Fichier indisponible",
    body: "Le fichier de cet ebook est temporairement indisponible. Contactez-nous, nous vous l'enverrons rapidement.",
  },
  EXHAUSTED: {
    title: "Limite de téléchargements atteinte",
    body: `Vous avez utilisé vos ${MAX_DOWNLOADS_PER_TOKEN} téléchargements pour ce lien. Écrivez-nous si vous avez besoin de récupérer à nouveau le fichier — nous vous enverrons un nouveau lien.`,
  },
};
