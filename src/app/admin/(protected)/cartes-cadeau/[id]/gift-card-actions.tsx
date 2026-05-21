"use client";

/**
 * Panneau d'actions admin pour une carte cadeau.
 *
 * Conditionnel selon status :
 *  - ACTIVE / PARTIALLY_USED → prolonger
 *  - ACTIVE intact (0 utilisation) → annuler + (si stripe) rembourser
 *  - EXPIRED → prolonger (réactive auto)
 *  - REFUNDED / CANCELLED → aucune action
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GiftCardStatus } from "@prisma/client";
import {
  cancelGiftCard,
  extendGiftCardExpiration,
  refundGiftCardStripe,
  resendGiftCardEmail,
} from "@/lib/actions/gift-card-admin";

type Props = {
  id: string;
  status: GiftCardStatus;
  expiresAtIso: string;
  hasStripePayment: boolean;
  isIntact: boolean;
  /** True si la carte a une adresse email valide à laquelle renvoyer. */
  canResendEmail: boolean;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

export function GiftCardActions({
  id,
  status,
  expiresAtIso,
  hasStripePayment,
  isIntact,
  canResendEmail,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showExtend, setShowExtend] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const router = useRouter();

  function runAction(
    fn: () => Promise<
      { ok: true; message?: string } | { ok: false; error: string }
    >,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setFeedback({
          kind: "success",
          text: result.message ?? "Action effectuée.",
        });
        router.refresh();
      } else {
        setFeedback({ kind: "error", text: result.error });
      }
    });
  }

  const noActionsAvailable =
    status === "REFUNDED" || status === "CANCELLED" || status === "FULLY_USED";

  const canResendNow =
    canResendEmail &&
    status !== "CANCELLED" &&
    status !== "REFUNDED" &&
    status !== "PENDING_PAYMENT";

  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
      <h2
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Actions
      </h2>

      {feedback && (
        <div
          role="alert"
          className={`text-xs p-3 rounded-[var(--radius-sm)] ${
            feedback.kind === "success"
              ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
              : "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          }`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {feedback.text}
        </div>
      )}

      {canResendNow && (
        <ActionButton
          label="Renvoyer l'email"
          description="Code + solde restant à la cliente"
          variant="primary"
          disabled={isPending}
          onClick={() => runAction(() => resendGiftCardEmail(id))}
        />
      )}

      {!noActionsAvailable && (
        <ActionButton
          label="Prolonger la validité"
          description="Modifier la date d'expiration"
          variant="secondary"
          disabled={isPending}
          onClick={() => setShowExtend(true)}
        />
      )}

      {!noActionsAvailable && isIntact && (
        <ActionButton
          label="Annuler la carte"
          description="Carte invalidée, jamais utilisée"
          variant="warning"
          disabled={isPending}
          onClick={() => setShowCancel(true)}
        />
      )}

      {!noActionsAvailable && isIntact && hasStripePayment && (
        <ActionButton
          label="Rembourser via Stripe"
          description="Remboursement complet + statut REFUNDED"
          variant="ghost-danger"
          disabled={isPending}
          onClick={() => setShowRefund(true)}
        />
      )}

      {noActionsAvailable && !canResendNow && (
        <p
          className="text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune action disponible sur une carte annulée, remboursée ou
          intégralement utilisée.
        </p>
      )}

      {showExtend && (
        <ExtendDialog
          currentExpiresAtIso={expiresAtIso}
          onCancel={() => setShowExtend(false)}
          onConfirm={(iso) => {
            setShowExtend(false);
            runAction(() => extendGiftCardExpiration(id, iso));
          }}
          disabled={isPending}
        />
      )}

      {showCancel && (
        <ConfirmDialog
          title="Annuler cette carte cadeau ?"
          warning="La carte sera invalidée définitivement. Si elle a été remise à un bénéficiaire, prévenez-le."
          ctaLabel="Confirmer l'annulation"
          onCancel={() => setShowCancel(false)}
          onConfirm={() => {
            setShowCancel(false);
            runAction(() => cancelGiftCard(id));
          }}
          disabled={isPending}
        />
      )}

      {showRefund && (
        <ConfirmDialog
          title="Rembourser via Stripe ?"
          warning="Action irréversible : le remboursement est immédiatement initié auprès de Stripe et la carte passe en REFUNDED."
          ctaLabel="Confirmer le remboursement"
          onCancel={() => setShowRefund(false)}
          onConfirm={() => {
            setShowRefund(false);
            runAction(() => refundGiftCardStripe(id));
          }}
          disabled={isPending}
        />
      )}
    </div>
  );
}

function ActionButton({
  label,
  description,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  description?: string;
  variant: "primary" | "secondary" | "warning" | "ghost-danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  const classes: Record<typeof variant, string> = {
    primary:
      "bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] border border-[var(--color-violet-600)]",
    secondary:
      "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)]/70 border border-[var(--color-violet-600)]/30",
    warning:
      "bg-[var(--color-warning)]/10 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20 border border-[var(--color-warning)]/30",
    "ghost-danger":
      "bg-transparent text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 rounded-[var(--radius-sm)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${classes[variant]}`}
    >
      <span
        className="block text-xs uppercase tracking-[0.06em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </span>
      {description && (
        <span
          className="block text-[11px] opacity-80 mt-0.5"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {description}
        </span>
      )}
    </button>
  );
}

function ExtendDialog({
  currentExpiresAtIso,
  onCancel,
  onConfirm,
  disabled,
}: {
  currentExpiresAtIso: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
  disabled?: boolean;
}) {
  // ISO → YYYY-MM-DD pour input type=date
  const initial = currentExpiresAtIso.slice(0, 10);
  // Min = demain (pas dans le passé)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const min = tomorrow.toISOString().slice(0, 10);

  const [date, setDate] = useState(initial);
  const valid = date >= min;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prolonger la validité"
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          Prolonger la validité
        </h3>
        <div className="space-y-1.5">
          <label
            htmlFor="new-expires"
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Nouvelle date d&apos;expiration
          </label>
          <input
            id="new-expires"
            type="date"
            value={date}
            min={min}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-all"
            style={{
              fontFamily: "var(--font-ui)",
              WebkitAppearance: "none",
              appearance: "none",
            }}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(new Date(date).toISOString())}
            disabled={disabled || !valid}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  warning,
  ctaLabel,
  onCancel,
  onConfirm,
  disabled,
}: {
  title: string;
  warning: string;
  ctaLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          {title}
        </h3>
        <p
          className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {warning}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-[var(--color-danger)] text-white hover:opacity-90"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
