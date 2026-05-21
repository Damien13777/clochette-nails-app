"use client";

/**
 * Petit bouton à afficher dans les fiches admin quand `stripeFeeCents` est
 * null mais qu'un `stripePaymentId` existe (= paiement Stripe sans frais
 * encore récupérés). Lance la server action qui va chercher la valeur via
 * l'API Stripe.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recalculateStripeFee,
  type StripeFeeResource,
} from "@/lib/actions/stripe-fee-backfill";

type Props = {
  resource: StripeFeeResource;
  id: string;
};

export function RecalculateStripeFeeButton({ resource, id }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await recalculateStripeFee(resource, id);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--color-violet-600)]/40 text-[var(--color-violet-700)] text-[10px] uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Récupération…" : "↻ Récupérer les frais"}
      </button>
      {error && (
        <span
          role="alert"
          className="text-[10px] text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </span>
      )}
    </div>
  );
}
