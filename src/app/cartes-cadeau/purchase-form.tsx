"use client";

/**
 * Form public d'achat de carte cadeau.
 *
 * 1 page, scroll naturel. Toggle "Pour moi / Pour offrir" qui révèle les
 * champs bénéficiaire si "Pour offrir".
 */

import { useState, useTransition } from "react";
import { createGiftCardPublic } from "@/lib/actions/gift-card-public";

const AMOUNT_PRESETS = [30, 50, 80, 100, 150];

export function GiftCardPurchaseForm() {
  // Input string-backed pour permettre l'effacement complet sans qu'un "0"
  // résiduel ne se ré-injecte. Parsé pour les calculs / submit.
  const [amountInput, setAmountInput] = useState<string>("50");
  const amountEuros = Number.parseFloat(amountInput.replace(",", ".")) || 0;
  const setAmountFromPreset = (n: number) => setAmountInput(String(n));
  const [forSelf, setForSelf] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createGiftCardPublic({
        amountCents: Math.round(amountEuros * 100),
        buyerName,
        buyerEmail,
        forSelf,
        recipientName: forSelf ? "" : recipientName,
        recipientEmail: forSelf ? "" : recipientEmail,
        giftMessage,
        honeypot: "",
      });
      if (result.ok) {
        window.location.href = result.checkoutUrl;
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <p
          role="alert"
          className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}

      {/* Bloc montant */}
      <Section title="Montant">
        <div className="flex flex-wrap gap-2 mb-3">
          {AMOUNT_PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmountFromPreset(a)}
              disabled={pending}
              className={`px-4 h-10 rounded-full text-sm uppercase tracking-[0.06em] transition-colors ${
                amountEuros === a
                  ? "bg-[var(--color-violet-600)] text-white"
                  : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {a} €
            </button>
          ))}
        </div>
        <Field
          label="Ou montant personnalisé (€)"
          error={fieldErrors.amountCents}
        >
          <input
            type="number"
            min={10}
            max={1000}
            step={5}
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={pending}
            placeholder="50"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Bloc destination */}
      <Section title="Pour qui ?">
        <div className="grid grid-cols-2 gap-3">
          <DestOption
            active={!forSelf}
            onClick={() => setForSelf(false)}
            disabled={pending}
            title="Pour offrir"
            desc="J'envoie la carte à quelqu'un"
          />
          <DestOption
            active={forSelf}
            onClick={() => setForSelf(true)}
            disabled={pending}
            title="Pour moi"
            desc="Je garde la carte pour moi-même"
          />
        </div>
      </Section>

      {/* Bénéficiaire (si pour offrir) */}
      {!forSelf && (
        <Section title="Bénéficiaire">
          <Field label="Nom complet" required error={fieldErrors.recipientName}>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={pending}
              className={inputCls}
              placeholder="Marie Dupont"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Email"
            required
            error={fieldErrors.recipientEmail}
            hint="La carte sera envoyée à cette adresse immédiatement après le paiement."
          >
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={pending}
              className={inputCls}
              placeholder="marie@exemple.fr"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Petit mot (optionnel)"
            error={fieldErrors.giftMessage}
            hint={`Pensez à signer pour que la bénéficiaire sache de qui vient ce cadeau. ${giftMessage.length}/500`}
          >
            <textarea
              rows={3}
              maxLength={500}
              value={giftMessage}
              onChange={(e) => setGiftMessage(e.target.value)}
              disabled={pending}
              className={`${inputCls} resize-y min-h-[4.5rem]`}
              placeholder="Joyeux anniversaire ! Profite bien — Offert par Sophie ❤"
            />
          </Field>
        </Section>
      )}

      {/* Acheteur */}
      <Section title="Vos coordonnées">
        <Field label="Nom complet" required error={fieldErrors.buyerName}>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            disabled={pending}
            className={inputCls}
            placeholder="Sophie Martin"
            autoComplete="name"
          />
        </Field>
        <Field
          label="Email"
          required
          error={fieldErrors.buyerEmail}
          hint="Vous recevrez votre reçu d'achat à cette adresse."
        >
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            disabled={pending}
            className={inputCls}
            placeholder="sophie@exemple.fr"
            autoComplete="email"
          />
        </Field>
      </Section>

      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none -z-10"
        style={{ left: "-9999px" }}
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pending
          ? "Redirection…"
          : `Payer ${amountEuros.toFixed(2)} € — carte bancaire`}
      </button>
      <p
        className="text-[11px] text-[var(--color-ink-500)] text-center sm:text-left"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Paiement sécurisé Stripe · La carte est envoyée immédiatement après
        confirmation du paiement.
      </p>
    </form>
  );
}

const inputCls =
  "w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
      <h2
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
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
      {hint && !error && (
        <span
          className="block text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {hint}
        </span>
      )}
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

function DestOption({
  active,
  onClick,
  disabled,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`text-left p-4 rounded-[var(--radius-md)] border transition-all disabled:opacity-50 ${
        active
          ? "border-[var(--color-violet-600)] bg-[var(--color-violet-50)] shadow-[var(--shadow-focus)]"
          : "border-[var(--color-line)] bg-[var(--color-paper)] hover:border-[var(--color-violet-100)]"
      }`}
    >
      <span
        className="block text-sm text-[var(--color-ink-900)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </span>
      <span
        className="block text-[11px] text-[var(--color-ink-500)] mt-1 leading-snug"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {desc}
      </span>
    </button>
  );
}
