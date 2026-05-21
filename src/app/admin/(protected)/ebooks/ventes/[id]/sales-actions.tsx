"use client";

/**
 * Panneau d'actions admin pour une vente d'ebook (EbookPurchase).
 *
 * Actions :
 *  - Renvoyer le mail (même token)
 *  - Réémettre un lien (nouveau token, +1 DL)
 *  - Rembourser (refund Stripe + reverse GC + révocation accès)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  refundEbookPurchase,
  reissueEbookDownload,
  resendEbookDeliveryEmail,
} from "@/lib/actions/ebook-sales-admin";

type Props = {
  id: string;
  canResend: boolean;
  canResendReason: string | null;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

export function SalesActions({ id, canResend, canResendReason }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showReissue, setShowReissue] = useState(false);
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

  function confirmResend() {
    if (!window.confirm("Renvoyer le mail de téléchargement à la cliente ?")) {
      return;
    }
    runAction(() => resendEbookDeliveryEmail(id));
  }

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

      <ActionButton
        label="Renvoyer le mail"
        description={
          canResend
            ? "Même lien · pas de DL supplémentaire"
            : canResendReason ?? "Indisponible"
        }
        variant="secondary"
        disabled={isPending || !canResend}
        title={!canResend ? canResendReason ?? undefined : undefined}
        onClick={confirmResend}
      />

      <ActionButton
        label="Réémettre un lien"
        description="Nouveau lien · +1 téléchargement · ancien révoqué"
        variant="primary"
        disabled={isPending}
        onClick={() => setShowReissue(true)}
      />

      <ActionButton
        label="Rembourser cet achat"
        description="Stripe + carte cadeau · accès au PDF révoqué"
        variant="ghost-danger"
        disabled={isPending}
        onClick={() => setShowRefund(true)}
      />

      {showReissue && (
        <ConfirmDialog
          title="Réémettre un lien ?"
          warning="Un nouveau lien sera envoyé à la cliente, l'ancien sera révoqué et un téléchargement supplémentaire lui sera accordé."
          ctaLabel="Confirmer la réémission"
          variant="primary"
          onCancel={() => setShowReissue(false)}
          onConfirm={() => {
            setShowReissue(false);
            runAction(() => reissueEbookDownload(id));
          }}
          disabled={isPending}
        />
      )}

      {showRefund && (
        <RefundDialog
          onCancel={() => setShowRefund(false)}
          onConfirm={(reason) => {
            setShowRefund(false);
            runAction(() => refundEbookPurchase(id, reason));
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
  title,
  onClick,
}: {
  label: string;
  description?: string;
  variant: "primary" | "secondary" | "ghost-danger";
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  const classes: Record<typeof variant, string> = {
    primary:
      "bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] border border-[var(--color-violet-600)]",
    secondary:
      "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)]/70 border border-[var(--color-violet-600)]/30",
    "ghost-danger":
      "bg-transparent text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
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

function ConfirmDialog({
  title,
  warning,
  ctaLabel,
  variant,
  onCancel,
  onConfirm,
  disabled,
}: {
  title: string;
  warning: string;
  ctaLabel: string;
  variant: "primary" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const ctaCls =
    variant === "primary"
      ? "bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)]"
      : "bg-[var(--color-danger)] text-white hover:opacity-90";
  const boxCls =
    variant === "primary"
      ? "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] border border-[var(--color-violet-600)]/30"
      : "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30";

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
          className={`text-xs p-3 rounded-[var(--radius-sm)] ${boxCls}`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {warning}
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
            className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${ctaCls}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundDialog({
  onCancel,
  onConfirm,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rembourser cet achat"
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          Rembourser cet achat ?
        </h3>
        <p
          className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          La portion Stripe et/ou carte cadeau sera reversée à la cliente, et
          son accès au PDF sera révoqué immédiatement.
        </p>
        <div className="space-y-1.5">
          <label
            htmlFor="refund-reason"
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Motif du remboursement
          </label>
          <textarea
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            minLength={3}
            required
            placeholder="Ex : demande cliente, erreur de paiement, doublon…"
            className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-all resize-y"
            style={{ fontFamily: "var(--font-ui)" }}
            autoFocus
          />
          <p
            className="text-[11px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Min. 3 caractères. Conservé dans le log d&apos;audit.
          </p>
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
            onClick={() => onConfirm(trimmed)}
            disabled={disabled || !valid}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-[var(--color-danger)] text-white hover:opacity-90"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Confirmer le remboursement
          </button>
        </div>
      </div>
    </div>
  );
}
