"use client";

/**
 * Formulaire achat d'un ebook.
 * Champs : email, nom, code carte cadeau optionnel, honeypot.
 * Soumission → purchaseEbookAction → redirect Stripe OU /ebooks/succes.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { purchaseEbookAction } from "@/lib/actions/ebook-purchase";
import { validateGiftCardCode } from "@/lib/actions/gift-card";

type Props = {
  ebookSlug: string;
  ebookTitle: string;
  ebookPriceCents: number;
};

type GiftCardValid = {
  code: string;
  prefix: string;
  remainingAmountCents: number;
};

export function EbookPurchaseForm({
  ebookSlug,
  ebookTitle,
  ebookPriceCents,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [giftValid, setGiftValid] = useState<GiftCardValid | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [isVerifying, startVerify] = useTransition();

  const giftApplied = giftValid
    ? Math.min(giftValid.remainingAmountCents, ebookPriceCents)
    : 0;
  const remainingCents = Math.max(0, ebookPriceCents - giftApplied);

  function handleVerifyGiftCard() {
    setError(null);
    const trimmed = giftCode.trim().toUpperCase();
    if (!trimmed) {
      setFieldErrors((e) => ({ ...e, giftCardCode: "Saisis un code." }));
      return;
    }
    startVerify(async () => {
      const result = await validateGiftCardCode(trimmed);
      if (result.ok) {
        setGiftValid({
          code: trimmed,
          prefix: result.data.prefix,
          remainingAmountCents: result.data.remainingAmountCents,
        });
        setFieldErrors((e) => {
          const next = { ...e };
          delete next.giftCardCode;
          return next;
        });
      } else {
        setGiftValid(null);
        setFieldErrors((e) => ({ ...e, giftCardCode: result.error }));
      }
    });
  }

  function handleRemoveGiftCard() {
    setGiftValid(null);
    setGiftCode("");
    setFieldErrors((e) => {
      const next = { ...e };
      delete next.giftCardCode;
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    startSubmit(async () => {
      const result = await purchaseEbookAction({
        ebookSlug,
        clientEmail: email,
        clientName: name,
        giftCardCode: giftValid?.code ?? "",
        honeypot,
      });

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      if ("checkoutUrl" in result) {
        window.location.href = result.checkoutUrl;
      } else if ("successUrl" in result) {
        router.push(result.successUrl);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Honeypot anti-bot */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Ne pas remplir
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(ev) => setHoneypot(ev.target.value)}
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}

      <Field label="Votre prénom et nom" required error={fieldErrors.clientName}>
        <input
          type="text"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          disabled={isSubmitting}
          autoComplete="name"
          className={inputCls}
          placeholder="Marie Dupont"
          maxLength={100}
        />
      </Field>

      <Field label="Votre email" required error={fieldErrors.clientEmail}>
        <input
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          disabled={isSubmitting}
          autoComplete="email"
          className={inputCls}
          placeholder="marie@example.com"
          maxLength={150}
        />
        <span
          className="block text-[11px] text-[var(--color-ink-500)] mt-1"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          C&apos;est sur cet email que vous recevrez le lien de téléchargement.
        </span>
      </Field>

      {/* Carte cadeau */}
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bone)]/40 p-4 space-y-3">
        <p
          className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          J&apos;ai un code cadeau
        </p>
        {!giftValid ? (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={giftCode}
                onChange={(ev) => setGiftCode(ev.target.value.toUpperCase())}
                disabled={isSubmitting || isVerifying}
                placeholder="GIFT-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm font-mono uppercase tracking-wider focus:outline-none focus:border-[var(--color-violet-600)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleVerifyGiftCard}
                disabled={isSubmitting || isVerifying || giftCode.trim().length < 4}
                className="shrink-0 inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {isVerifying ? "…" : "Vérifier"}
              </button>
            </div>
            {fieldErrors.giftCardCode && (
              <p
                role="alert"
                className="text-xs text-[var(--color-danger)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                ⚠ {fieldErrors.giftCardCode}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-start justify-between gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30">
            <div className="min-w-0 flex-1">
              <p
                className="text-sm text-[var(--color-success)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                ✓ Code valide{" "}
                <span className="font-mono">…{giftValid.prefix}</span>
              </p>
              <p
                className="text-xs text-[var(--color-ink-700)] mt-0.5"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Solde : <strong>{formatCents(giftValid.remainingAmountCents)}</strong>
                {" · "}Appliqué :{" "}
                <strong>−{formatCents(giftApplied)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemoveGiftCard}
              disabled={isSubmitting}
              className="shrink-0 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-danger)] underline disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Retirer
            </button>
          </div>
        )}
      </div>

      {/* Récapitulatif */}
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] p-4 space-y-2">
        <div className="flex justify-between text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          <span className="text-[var(--color-ink-700)]">{ebookTitle}</span>
          <span className="text-[var(--color-ink-900)]">{formatCents(ebookPriceCents)}</span>
        </div>
        {giftApplied > 0 && (
          <div className="flex justify-between text-sm" style={{ fontFamily: "var(--font-ui)" }}>
            <span className="text-[var(--color-success)]">Carte cadeau</span>
            <span className="text-[var(--color-success)]">−{formatCents(giftApplied)}</span>
          </div>
        )}
        <div
          className="flex justify-between pt-2 border-t border-[var(--color-line)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className="text-sm uppercase tracking-[0.08em] text-[var(--color-ink-900)]">
            À payer
          </span>
          <span className="text-lg text-[var(--color-violet-700)]">
            {formatCents(remainingCents)}
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !email || !name}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[var(--color-violet-600)] text-white text-sm uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isSubmitting
          ? "Patiente…"
          : remainingCents === 0
            ? "Confirmer (gratuit avec carte cadeau)"
            : `Payer ${formatCents(remainingCents)}`}
      </button>

      <p
        className="text-[11px] text-center text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Paiement sécurisé Stripe. Le lien de téléchargement vous sera envoyé
        par email après confirmation du paiement.
      </p>
    </form>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

const inputCls =
  "w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all";

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span
        className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
        {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
      </span>
      {children}
      {error && (
        <span
          role="alert"
          className="block text-[11px] text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </span>
      )}
    </label>
  );
}
