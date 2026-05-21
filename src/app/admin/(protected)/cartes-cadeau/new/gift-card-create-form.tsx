"use client";

/**
 * Formulaire de création manuelle d'une carte cadeau.
 *
 * Après création, le code en clair est affiché UNE SEULE FOIS dans une
 * card de succès (et envoyé par email au bénéficiaire).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { createGiftCardAdmin } from "@/lib/actions/gift-card-admin";

const AMOUNT_PRESETS = [30, 50, 80, 100, 150];
const VALIDITY_PRESETS = [6, 12, 24];

type Mode = "ADMIN_GIFT" | "ADMIN_SALE";
type PaymentMethod = "cash" | "transfer" | "check" | "card_terminal";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Espèces" },
  { value: "card_terminal", label: "TPE / CB" },
  { value: "transfer", label: "Virement" },
  { value: "check", label: "Chèque" },
];

type CreatedResult = {
  id: string;
  code: string;
  recipientEmail: string;
};

export function GiftCardCreateForm() {
  const [mode, setMode] = useState<Mode>("ADMIN_GIFT");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerSameAsRecipient, setBuyerSameAsRecipient] = useState(true);
  const [amountEuros, setAmountEuros] = useState<number>(50);
  const [validityMonths, setValidityMonths] = useState<number>(12);
  const [giftMessage, setGiftMessage] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      // En ADMIN_SALE, si "acheteuse identique au bénéficiaire", on copie les valeurs
      const effectiveBuyerName =
        mode === "ADMIN_SALE"
          ? buyerSameAsRecipient
            ? recipientName
            : buyerName
          : undefined;
      const effectiveBuyerEmail =
        mode === "ADMIN_SALE"
          ? buyerSameAsRecipient
            ? recipientEmail
            : buyerEmail
          : undefined;

      const result = await createGiftCardAdmin({
        recipientName,
        recipientEmail,
        amountEuros,
        validityMonths,
        giftMessage,
        mode,
        paymentMethod: mode === "ADMIN_SALE" ? paymentMethod : undefined,
        buyerName: effectiveBuyerName,
        buyerEmail: effectiveBuyerEmail,
      });
      if (result.ok) {
        setCreated({
          id: result.id,
          code: result.code,
          recipientEmail: recipientEmail.trim().toLowerCase(),
        });
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  async function copyCode() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore (mobile dev tools etc.)
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-[var(--radius-md)] p-6 space-y-4">
          <h2
            className="text-lg text-[var(--color-success)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            ✓ Carte cadeau émise
          </h2>
          <p
            className="text-sm text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Email envoyé à <strong>{created.recipientEmail}</strong>. Le code
            ci-dessous ne sera plus jamais visible dans l&apos;admin — copie-le
            si tu veux l&apos;avoir sous la main.
          </p>

          <div className="bg-[var(--color-paper)] border-2 border-[var(--color-violet-600)] rounded-[var(--radius-sm)] p-5 text-center">
            <p
              className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Code unique
            </p>
            <p
              className="font-mono text-2xl text-[var(--color-ink-900)] tracking-wider break-all"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {created.code}
            </p>
            <button
              type="button"
              onClick={copyCode}
              className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {copied ? "✓ Copié" : "Copier"}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/admin/cartes-cadeau/${created.id}`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Voir la fiche carte
          </Link>
          <Link
            href="/admin/cartes-cadeau"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Retour à la liste
          </Link>
        </div>
      </div>
    );
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

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Type d&apos;émission
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ModeOption
            active={mode === "ADMIN_GIFT"}
            onClick={() => setMode("ADMIN_GIFT")}
            disabled={isPending}
            title="Carte offerte"
            desc="Geste commercial, fidélisation, cadeau famille. N'entre pas dans le calcul du CA."
          />
          <ModeOption
            active={mode === "ADMIN_SALE"}
            onClick={() => setMode("ADMIN_SALE")}
            disabled={isPending}
            title="Vente en salon"
            desc="La cliente règle en salon. Entre dans le CA du mois."
          />
        </div>

        {mode === "ADMIN_SALE" && (
          <Field
            label="Mode de paiement"
            required
            error={fieldErrors.paymentMethod}
            hint="Comment la cliente a réglé en salon."
          >
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPaymentMethod(p.value)}
                  disabled={isPending}
                  className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] transition-colors ${
                    paymentMethod === p.value
                      ? "bg-[var(--color-violet-600)] text-white"
                      : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Bénéficiaire
        </h2>

        <Field label="Nom complet" required error={fieldErrors.recipientName}>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="Marie Dupont"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Email"
          required
          error={fieldErrors.recipientEmail}
          hint="La carte sera envoyée immédiatement à cette adresse."
        >
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="marie@exemple.fr"
            autoComplete="off"
          />
        </Field>
      </div>

      {mode === "ADMIN_SALE" && (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
          <h2
            className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Acheteuse (pour le reçu)
          </h2>

          <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={buyerSameAsRecipient}
              onChange={(e) => setBuyerSameAsRecipient(e.target.checked)}
              disabled={isPending}
              className="sr-only peer"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
                buyerSameAsRecipient
                  ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-paper)]"
              }`}
            >
              {buyerSameAsRecipient && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            <span>
              <span
                className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Acheteuse identique au bénéficiaire
              </span>
              <span
                className="block text-[11px] text-[var(--color-ink-500)] mt-0.5"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Décoche si la cliente achète pour offrir à quelqu&apos;un d&apos;autre.
              </span>
            </span>
          </label>

          {!buyerSameAsRecipient && (
            <div className="space-y-4 pl-7">
              <Field
                label="Nom acheteuse"
                error={fieldErrors.buyerName}
              >
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                  placeholder="Sophie Martin"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Email acheteuse"
                error={fieldErrors.buyerEmail}
                hint="Reçu envoyé à cette adresse. Laisser vide pour ne pas envoyer de reçu."
              >
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                  placeholder="sophie@exemple.fr"
                  autoComplete="off"
                />
              </Field>
            </div>
          )}

          {buyerSameAsRecipient && (
            <p
              className="text-[11px] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Le reçu sera envoyé à <strong>{recipientEmail || "l'email du bénéficiaire"}</strong>.
            </p>
          )}
        </div>
      )}

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Montant & validité
        </h2>

        <Field
          label="Montant (€)"
          required
          error={fieldErrors.amountEuros}
        >
          <div className="flex flex-wrap gap-2 mb-2">
            {AMOUNT_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmountEuros(a)}
                disabled={isPending}
                className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] transition-colors ${
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
          <input
            type="number"
            min={10}
            max={1000}
            step={5}
            value={amountEuros}
            onChange={(e) => setAmountEuros(parseFloat(e.target.value) || 0)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>

        <Field
          label="Validité (mois)"
          required
          error={fieldErrors.validityMonths}
          hint="Date d'expiration calculée automatiquement à partir d'aujourd'hui."
        >
          <div className="flex flex-wrap gap-2">
            {VALIDITY_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValidityMonths(m)}
                disabled={isPending}
                className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] transition-colors ${
                  validityMonths === m
                    ? "bg-[var(--color-violet-600)] text-white"
                    : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                }`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {m} mois
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Message personnel (optionnel)
        </h2>

        <Field
          label="Petit mot pour la bénéficiaire"
          error={fieldErrors.giftMessage}
          hint={`Apparaîtra dans l'email de réception. ${giftMessage.length}/500`}
        >
          <textarea
            rows={3}
            maxLength={500}
            value={giftMessage}
            onChange={(e) => setGiftMessage(e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[4.5rem]`}
            placeholder="Joyeux anniversaire ! Profite bien."
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {isPending ? "Création…" : "Créer & envoyer par email"}
        </button>
        <Link
          href="/admin/cartes-cadeau"
          className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all";

function ModeOption({
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
