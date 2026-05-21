"use client";

/**
 * Champ optionnel "J'ai un code cadeau" — étape 4 du flow réservation.
 *
 * Workflow :
 *  1. User saisit le code → clic "Vérifier"
 *  2. Appel server action validateGiftCardCode → solde retourné
 *  3. Affichage : ✓ Code valide, solde X €. Bouton "Retirer".
 *  4. Modification du code → reset état + notifier parent
 *
 * Le parent reçoit via `onValidated(code | null, amountCents | 0)` pour pouvoir
 * passer le code à createBookingAction au submit.
 */

import { useState, useTransition } from "react";
import { validateGiftCardCode } from "@/lib/actions/gift-card";

type Props = {
  onValidated: (code: string | null, amountCents: number) => void;
  disabled?: boolean;
};

type Validated = {
  code: string;
  prefix: string;
  amountCents: number;
  expiresAt: string;
};

export function GiftCardField({ onValidated, disabled }: Props) {
  const [code, setCode] = useState("");
  const [validated, setValidated] = useState<Validated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Saisissez un code.");
      return;
    }
    startTransition(async () => {
      const result = await validateGiftCardCode(trimmed);
      if (result.ok) {
        const v: Validated = {
          code: trimmed,
          prefix: result.data.prefix,
          amountCents: result.data.remainingAmountCents,
          expiresAt: result.data.expiresAt,
        };
        setValidated(v);
        setError(null);
        onValidated(trimmed, v.amountCents);
      } else {
        setValidated(null);
        setError(result.error);
        onValidated(null, 0);
      }
    });
  }

  function handleRemove() {
    setValidated(null);
    setCode("");
    setError(null);
    onValidated(null, 0);
  }

  function handleCodeChange(value: string) {
    setCode(value);
    if (validated && value.trim().toUpperCase() !== validated.code) {
      // L'utilisateur a modifié, on invalide
      setValidated(null);
      onValidated(null, 0);
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bone)]/40 p-4 space-y-3">
      <label
        htmlFor="giftCardCode"
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        J&apos;ai un code cadeau
      </label>

      {!validated ? (
        <div className="flex gap-2">
          <input
            id="giftCardCode"
            type="text"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            disabled={disabled || isPending}
            placeholder="GIFT-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm font-mono uppercase tracking-wider focus:outline-none focus:border-[var(--color-violet-600)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={disabled || isPending || code.trim().length < 4}
            className="shrink-0 inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isPending ? "…" : "Vérifier"}
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30">
          <div className="min-w-0 flex-1">
            <p
              className="text-sm text-[var(--color-success)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              ✓ Code valide{" "}
              <span className="font-mono">…{validated.prefix}</span>
            </p>
            <p
              className="text-xs text-[var(--color-ink-700)] mt-0.5"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Solde disponible : <strong>{formatCents(validated.amountCents)}</strong>
              {" · "}Valide jusqu&apos;au{" "}
              {new Date(validated.expiresAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || isPending}
            className="shrink-0 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-danger)] underline disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Retirer
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}
