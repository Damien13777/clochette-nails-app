"use client";

/**
 * Form 2 étapes pour l'annulation cliente :
 *  1. Bouton "Confirmer l'annulation" → ouvre la confirmation (case à cocher + bouton final)
 *  2. Bouton "Oui, j'annule définitivement" → appelle l'action serveur
 *  3. Succès → affiche message vert (refund Stripe en cours)
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { cancelBookingByClient } from "@/lib/actions/booking-client";

type ViewState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | {
      kind: "success";
      refundedCents: number;
      depositKept: boolean;
      refundBreakdown?: {
        stripeCents: number;
        giftCardCents: number;
        giftCardPrefix: string | null;
      };
    }
  | { kind: "error"; message: string };

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function CancelForm({
  token,
  depositKept,
}: {
  token: string;
  /** true si < 72h → annulation possible mais acompte conservé */
  depositKept: boolean;
}) {
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await cancelBookingByClient(token);
      if (result.ok) {
        setView({
          kind: "success",
          refundedCents: result.refundedCents,
          depositKept: result.depositKept,
          refundBreakdown: result.refundBreakdown,
        });
      } else {
        setView({ kind: "error", message: result.error });
      }
    });
  }

  if (view.kind === "success") {
    return (
      <div className="text-center bg-[#f0f9f4] border border-[#bfe3cc] rounded-[var(--radius-sm)] p-6">
        <div className="mx-auto w-12 h-12 rounded-full grid place-items-center mb-4 bg-[#2d8659]/15 text-[#1d6b48]">
          <svg
            width="24"
            height="24"
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
          className="text-xs uppercase tracking-[0.22em] text-[#1d6b48] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Annulation confirmée
        </p>
        {view.depositKept ? (
          <>
            <h2
              className="text-xl text-[var(--color-ink-900)] mb-3"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Votre rendez-vous a bien été annulé
            </h2>
            <p
              className="text-sm text-[var(--color-ink-700)] mb-4"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Un email de confirmation vient de vous être envoyé. Les
              conditions relatives à l&apos;acompte vous ont été détaillées
              avant validation et sont précisées dans nos CGV §11.
            </p>
          </>
        ) : (
          (() => {
            const breakdown = view.refundBreakdown;
            const hasStripe = (breakdown?.stripeCents ?? 0) > 0;
            const hasGc = (breakdown?.giftCardCents ?? 0) > 0;
            const isMixed = hasStripe && hasGc;
            const gcOnly = !hasStripe && hasGc;
            const gcPrefix = breakdown?.giftCardPrefix;

            const title = gcOnly
              ? `Carte cadeau re-créditée de ${formatCents(view.refundedCents)}`
              : `Remboursement de ${formatCents(view.refundedCents)} en cours`;

            let body: React.ReactNode;
            if (gcOnly) {
              body = (
                <>
                  Votre rendez-vous a bien été annulé. Le montant a été
                  re-crédité <strong>immédiatement</strong> sur votre carte
                  cadeau{gcPrefix ? <> ••{gcPrefix}</> : null}, utilisable
                  jusqu&apos;à sa date d&apos;expiration. Un email de
                  confirmation vient de vous être envoyé.
                </>
              );
            } else if (isMixed) {
              body = (
                <>
                  Votre rendez-vous a bien été annulé.
                  <span className="block mt-2">
                    • {formatCents(breakdown!.stripeCents)} sur votre carte
                    bancaire (<strong>3 à 5 jours ouvrés</strong>)
                    <br />
                    • {formatCents(breakdown!.giftCardCents)} re-crédités{" "}
                    <strong>immédiatement</strong> sur votre carte cadeau
                    {gcPrefix ? <> ••{gcPrefix}</> : null}
                  </span>
                  <span className="block mt-2">
                    Un email de confirmation vient de vous être envoyé.
                  </span>
                </>
              );
            } else {
              body = (
                <>
                  Votre rendez-vous a bien été annulé. Le remboursement
                  apparaîtra sur votre carte bancaire sous{" "}
                  <strong>3 à 5 jours ouvrés</strong>. Un email de confirmation
                  vient de vous être envoyé.
                </>
              );
            }

            return (
              <>
                <h2
                  className="text-xl text-[var(--color-ink-900)] mb-3"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {title}
                </h2>
                <p
                  className="text-sm text-[var(--color-ink-700)] mb-4"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {body}
                </p>
              </>
            );
          })()
        )}
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="text-center bg-[#fff5f0] border border-[#f0c8b0] rounded-[var(--radius-sm)] p-6">
        <div className="mx-auto w-12 h-12 rounded-full grid place-items-center mb-4 bg-[#c87850]/15 text-[#c87850]">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[#c87850] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Erreur
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)] mb-4"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {view.message}
        </p>
        <button
          type="button"
          onClick={() => setView({ kind: "idle" })}
          className="text-xs uppercase tracking-[0.06em] text-[var(--color-violet-700)] hover:underline"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (view.kind === "confirming") {
    return (
      <div className="bg-[#fff5f0] border border-[#f0c8b0] rounded-[var(--radius-sm)] p-5">
        <p
          className="text-sm text-[var(--color-ink-900)] mb-4"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Une dernière vérification avant de tout valider :
        </p>

        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={pending}
            className="mt-0.5 w-4 h-4 rounded border-[var(--color-ink-300)] text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
          />
          <span
            className="text-xs text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {depositKept ? (
              <>
                Je comprends que l&apos;annulation est définitive, que ce lien
                ne pourra plus servir, et que{" "}
                <strong className="text-[var(--color-ink-900)]">
                  les conditions sur l&apos;acompte précisées plus haut
                </strong>{" "}
                s&apos;appliquent (CGV §11).
              </>
            ) : (
              <>
                Je comprends que l&apos;annulation est définitive et que ce lien
                ne pourra plus servir. Le remboursement de mon acompte sera initié
                immédiatement.
              </>
            )}
          </span>
        </label>

        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!acknowledged || pending}
            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-full bg-[#a52a4a] text-white text-xs uppercase tracking-[0.06em] hover:bg-[#8a223e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pending ? "Annulation en cours…" : "Oui, j'annule définitivement"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAcknowledged(false);
              setView({ kind: "idle" });
            }}
            disabled={pending}
            className="inline-flex items-center justify-center px-5 py-3 rounded-full border border-[var(--color-ink-300)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-cream)] transition-colors disabled:opacity-40"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Revenir en arrière
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={() => setView({ kind: "confirming" })}
      className="w-full inline-flex items-center justify-center px-5 py-3 rounded-full bg-[#a52a4a] text-white text-xs uppercase tracking-[0.06em] hover:bg-[#8a223e] transition-colors"
      style={{ fontFamily: "var(--font-display)" }}
    >
      Annuler mon rendez-vous
    </button>
  );
}
