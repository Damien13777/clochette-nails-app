"use client";

/**
 * Panneau d'actions admin pour une réservation.
 * Affiche les boutons pertinents selon le status courant.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@prisma/client";
import {
  cancelBookingAdmin,
  forceConfirmBooking,
  markBookingCompleted,
  markBookingNoShow,
  refundBookingFull,
  updateBookingRevenue,
  type MarkCompletedInput,
} from "@/lib/actions/booking-admin";
import { lookupGiftCardForAdmin } from "@/lib/actions/gift-card-admin";
import { formatCents } from "@/lib/booking-display";
import { RescheduleDialog } from "./reschedule-dialog";

type Props = {
  bookingId: string;
  status: BookingStatus;
  hasStripePayment: boolean;
  depositCents: number;
  refundedAmount: number;
  /** Portion de l'acompte payée par carte cadeau (le reste = Stripe-payé). */
  giftCardAmountCents: number;
  currentDate: string; // YYYY-MM-DD
  currentStartTime: string; // HH:MM
  totalPriceCents: number;
  paymentMethod: string | null;
  /** True si l'acompte Stripe a bien été encaissé (sert au libellé modale). */
  isDepositReceived: boolean;
  /** Montant déjà saisi au markCompleted (null = non honoré). */
  revenueCents: number | null;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

export function BookingActions({
  bookingId,
  status,
  hasStripePayment,
  depositCents,
  refundedAmount,
  giftCardAmountCents,
  currentDate,
  currentStartTime,
  totalPriceCents,
  paymentMethod,
  isDepositReceived,
  revenueCents,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [showRevenue, setShowRevenue] = useState<false | "create" | "edit">(false);
  const router = useRouter();

  function runAction(
    fn: () => Promise<
      | { ok: true; message?: string }
      | { ok: false; error: string }
    >,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setFeedback({ kind: "success", text: result.message ?? "Action effectuée." });
        router.refresh();
      } else {
        setFeedback({ kind: "error", text: result.error });
      }
    });
  }

  // Montant réellement encaissé par Stripe (acompte − portion carte cadeau)
  const stripePortion = Math.max(0, depositCents - giftCardAmountCents);
  const refundableStripeCents = Math.max(0, stripePortion - refundedAmount);
  const canRefund =
    hasStripePayment &&
    refundableStripeCents > 0 &&
    (status === "CONFIRMED" || status === "NO_SHOW" || status === "COMPLETED");

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

      {/* Actions par statut */}
      {status === "AWAITING_DEPOSIT" && (
        <>
          <ActionButton
            label="Confirmer manuellement"
            description="Paiement reçu en espèces / virement"
            variant="primary"
            disabled={isPending}
            onClick={() =>
              runAction(() => forceConfirmBooking(bookingId))
            }
          />
          <ActionButton
            label="Annuler la réservation"
            variant="danger"
            disabled={isPending}
            onClick={() => setShowCancel(true)}
          />
        </>
      )}

      {status === "CONFIRMED" && (
        <>
          <ActionButton
            label="Marquer comme honorée"
            description="RDV terminé · saisie du montant perçu"
            variant="primary"
            disabled={isPending}
            onClick={() => setShowRevenue("create")}
          />
          <ActionButton
            label="Déplacer le RDV"
            description="Choisir un nouveau créneau · email auto à la cliente"
            variant="secondary"
            disabled={isPending}
            onClick={() => setShowReschedule(true)}
          />
          <ActionButton
            label="Marquer absente (no-show)"
            description="Cliente ne s'est pas présentée"
            variant="warning"
            disabled={isPending}
            onClick={() => runAction(() => markBookingNoShow(bookingId))}
          />
          <ActionButton
            label="Annuler la réservation"
            variant="danger"
            disabled={isPending}
            onClick={() => setShowCancel(true)}
          />
          {canRefund && (
            <ActionButton
              label={`Rembourser ${formatCents(refundableStripeCents)}`}
              description="Via Stripe — annule la réservation"
              variant="ghost-danger"
              disabled={isPending}
              onClick={() => setShowRefund(true)}
            />
          )}
        </>
      )}

      {status === "COMPLETED" && (
        <ActionButton
          label={
            revenueCents !== null
              ? `Modifier montant perçu (${formatCents(revenueCents)})`
              : "Saisir le montant perçu"
          }
          description="Corriger le CA réel encaissé sur ce RDV"
          variant="secondary"
          disabled={isPending}
          onClick={() => setShowRevenue("edit")}
        />
      )}

      {(status === "COMPLETED" || status === "NO_SHOW") && canRefund && (
        <ActionButton
          label={`Rembourser ${formatCents(refundableStripeCents)}`}
          description="Via Stripe (cas exceptionnel)"
          variant="ghost-danger"
          disabled={isPending}
          onClick={() => setShowRefund(true)}
        />
      )}

      {(status === "CANCELLED_BY_CLIENT" ||
        status === "CANCELLED_BY_ADMIN" ||
        status === "EXPIRED") && (
        <p
          className="text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune action disponible sur une réservation annulée ou expirée.
        </p>
      )}

      {/* Modale Annulation */}
      {showCancel && (
        <ReasonDialog
          title="Annuler la réservation"
          ctaLabel="Confirmer l'annulation"
          ctaVariant="danger"
          placeholder="Ex : créneau indisponible suite à imprévu personnel"
          value={cancelReason}
          onChange={setCancelReason}
          onCancel={() => {
            setShowCancel(false);
            setCancelReason("");
          }}
          onConfirm={() => {
            runAction(() => cancelBookingAdmin(bookingId, cancelReason));
            setShowCancel(false);
            setCancelReason("");
          }}
          disabled={isPending}
        />
      )}

      {/* Modale Déplacement */}
      {showReschedule && (
        <RescheduleDialog
          bookingId={bookingId}
          currentDate={currentDate}
          currentStartTime={currentStartTime}
          onCancel={() => setShowReschedule(false)}
          onSuccess={(message) => {
            setShowReschedule(false);
            setFeedback({ kind: "success", text: message });
            router.refresh();
          }}
        />
      )}

      {/* Modale "Marquer honoré" (création) */}
      {showRevenue === "create" && (
        <MarkCompletedDialog
          totalPriceCents={totalPriceCents}
          depositCents={depositCents}
          giftCardAmountCents={giftCardAmountCents}
          paymentMethod={paymentMethod}
          isDepositReceived={isDepositReceived}
          disabled={isPending}
          onCancel={() => setShowRevenue(false)}
          onConfirm={(payload) => {
            setShowRevenue(false);
            runAction(() => markBookingCompleted(bookingId, payload));
          }}
        />
      )}

      {/* Modale "Modifier montant perçu" (édition simple) */}
      {showRevenue === "edit" && (
        <EditRevenueDialog
          totalPriceCents={totalPriceCents}
          depositCents={depositCents}
          paymentMethod={paymentMethod}
          isDepositReceived={isDepositReceived}
          currentRevenueCents={revenueCents}
          disabled={isPending}
          onCancel={() => setShowRevenue(false)}
          onConfirm={(cents) => {
            setShowRevenue(false);
            runAction(() => updateBookingRevenue(bookingId, cents));
          }}
        />
      )}

      {/* Modale Remboursement */}
      {showRefund && (
        <ReasonDialog
          title="Rembourser la réservation"
          ctaLabel="Confirmer le remboursement"
          ctaVariant="danger"
          warning="Action irréversible : le remboursement est immédiatement initié auprès de Stripe et la réservation passe en annulée."
          placeholder="Ex : geste commercial, erreur de prestation, etc."
          value={refundReason}
          onChange={setRefundReason}
          onCancel={() => {
            setShowRefund(false);
            setRefundReason("");
          }}
          onConfirm={() => {
            runAction(() => refundBookingFull(bookingId, refundReason));
            setShowRefund(false);
            setRefundReason("");
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
  variant: "primary" | "secondary" | "danger" | "warning" | "ghost-danger";
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
    danger:
      "bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 border border-[var(--color-danger)]/30",
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

function ReasonDialog({
  title,
  ctaLabel,
  ctaVariant,
  warning,
  placeholder,
  value,
  onChange,
  onCancel,
  onConfirm,
  disabled,
}: {
  title: string;
  ctaLabel: string;
  ctaVariant: "danger";
  warning?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
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
        <h3
          className="text-lg"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {title}
        </h3>
        {warning && (
          <p
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⚠ {warning}
          </p>
        )}
        <div className="space-y-1.5">
          <label
            htmlFor="reason"
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Raison <span className="text-[var(--color-danger)]">*</span>
          </label>
          <textarea
            id="reason"
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y"
            style={{ fontFamily: "var(--font-ui)" }}
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
            onClick={onConfirm}
            disabled={disabled || value.trim().length < 3}
            className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              ctaVariant === "danger"
                ? "bg-[var(--color-danger)] text-white hover:opacity-90"
                : "bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)]"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function paymentMethodLabelFr(method: string | null): string {
  switch (method) {
    case "stripe":
      return "Stripe";
    case "cash":
      return "espèces";
    case "transfer":
      return "virement";
    case "check":
      return "chèque";
    case "card_terminal":
      return "TPE";
    case "gift_card_full":
      return "carte cadeau";
    case "none":
      return "sans acompte";
    default:
      return method ?? "—";
  }
}

/**
 * Modale "Modifier le montant perçu" — édition simple post-honoré.
 * N'affecte QUE revenueCents (la part cash/CB). La part GC est invariable.
 */
function EditRevenueDialog({
  totalPriceCents,
  depositCents,
  paymentMethod,
  isDepositReceived,
  currentRevenueCents,
  disabled,
  onCancel,
  onConfirm,
}: {
  totalPriceCents: number;
  depositCents: number;
  paymentMethod: string | null;
  isDepositReceived: boolean;
  currentRevenueCents: number | null;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: (cents: number) => void;
}) {
  const initialEuros =
    currentRevenueCents !== null
      ? (currentRevenueCents / 100).toFixed(2)
      : (totalPriceCents / 100).toFixed(2);
  const [amount, setAmount] = useState(initialEuros);

  const parsed = Number.parseFloat(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000;
  const cents = valid ? Math.round(parsed * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modifier le montant perçu"
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          Modifier le montant perçu
        </h3>

        <dl
          className="text-xs space-y-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--color-bone)] border border-[var(--color-line)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-ink-500)]">Prix prévu</dt>
            <dd className="text-[var(--color-ink-900)]">
              {(totalPriceCents / 100).toFixed(2)} €
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-ink-500)]">Acompte</dt>
            <dd className="text-[var(--color-ink-900)] text-right">
              {isDepositReceived
                ? `${(depositCents / 100).toFixed(2)} € via Stripe`
                : paymentMethod === "none"
                ? "Aucun (no deposit)"
                : `Aucun acompte versé (${paymentMethodLabelFr(paymentMethod)})`}
            </dd>
          </div>
        </dl>

        <div className="space-y-1.5">
          <label
            htmlFor="revenue-amount-edit"
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Montant perçu hors carte cadeau (€){" "}
            <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="revenue-amount-edit"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
            autoFocus
          />
          <p
            className="text-[11px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Source du CA mensuel. La part éventuellement réglée par carte cadeau
            n&apos;est pas modifiable ici.
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
            onClick={() => onConfirm(cents)}
            disabled={disabled || !valid}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Mettre à jour
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale "Marquer comme honorée" (création) ──────────────────

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      id: string;
      prefix: string;
      remainingAmountCents: number;
      recipientName: string | null;
    }
  | { status: "error"; message: string };

const COMPLETION_METHOD_OPTIONS: {
  value: "cash" | "card_terminal" | "transfer" | "check";
  label: string;
}[] = [
  { value: "cash", label: "Espèces" },
  { value: "card_terminal", label: "TPE / CB" },
  { value: "transfer", label: "Virement" },
  { value: "check", label: "Chèque" },
];

function MarkCompletedDialog({
  totalPriceCents,
  depositCents,
  giftCardAmountCents,
  paymentMethod,
  isDepositReceived,
  disabled,
  onCancel,
  onConfirm,
}: {
  totalPriceCents: number;
  depositCents: number;
  /** Portion d'acompte déjà payée en carte cadeau (BOOKING_DEPOSIT). */
  giftCardAmountCents: number;
  paymentMethod: string | null;
  isDepositReceived: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: (payload: MarkCompletedInput) => void;
}) {
  // Reste à percevoir par défaut = prix total − ce qui a déjà été encaissé
  const alreadyReceived =
    (isDepositReceived ? depositCents - giftCardAmountCents : 0) +
    giftCardAmountCents;
  const remainingDefault = Math.max(0, totalPriceCents - alreadyReceived);

  const [completionAmount, setCompletionAmount] = useState<string>(
    (remainingDefault / 100).toFixed(2),
  );
  const [completionMethod, setCompletionMethod] =
    useState<"cash" | "card_terminal" | "transfer" | "check">("cash");

  const [useGiftCard, setUseGiftCard] = useState(false);
  const [gcCode, setGcCode] = useState("");
  const [gcAmount, setGcAmount] = useState<string>("0");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [lookupPending, startLookup] = useTransition();
  const [sendInvoice, setSendInvoice] = useState(false);

  const parsedCash = Number.parseFloat(completionAmount.replace(",", "."));
  const cashValid =
    Number.isFinite(parsedCash) && parsedCash >= 0 && parsedCash <= 100_000;
  const cashCents = cashValid ? Math.round(parsedCash * 100) : 0;

  const parsedGc = Number.parseFloat(gcAmount.replace(",", "."));
  const gcCents =
    Number.isFinite(parsedGc) && parsedGc >= 0 ? Math.round(parsedGc * 100) : 0;

  const gcMax =
    lookup.status === "ok" ? lookup.remainingAmountCents : 0;
  const gcExceedsBalance = useGiftCard && gcCents > gcMax;
  const gcReady =
    !useGiftCard ||
    (lookup.status === "ok" && gcCents > 0 && !gcExceedsBalance);

  const totalEntered = cashCents + (useGiftCard ? gcCents : 0);
  const canValidate =
    cashValid &&
    totalEntered > 0 &&
    gcReady &&
    (cashCents === 0 || true); // method always valid (default cash)

  function checkCode() {
    if (!gcCode.trim()) return;
    setLookup({ status: "loading" });
    startLookup(async () => {
      const result = await lookupGiftCardForAdmin(gcCode);
      if (result.ok) {
        setLookup({
          status: "ok",
          id: result.data.id,
          prefix: result.data.prefix,
          remainingAmountCents: result.data.remainingAmountCents,
          recipientName: result.data.recipientName,
        });
        // pré-remplir gcAmount avec le minimum entre solde et reste à percevoir
        const suggested = Math.min(
          result.data.remainingAmountCents,
          remainingDefault,
        );
        setGcAmount((suggested / 100).toFixed(2));
        // ajuster cash
        const newCash = Math.max(0, remainingDefault - suggested);
        setCompletionAmount((newCash / 100).toFixed(2));
      } else {
        setLookup({ status: "error", message: result.error });
      }
    });
  }

  function handleSubmit() {
    if (!canValidate) return;
    const payload: MarkCompletedInput = {
      revenueCents: cashCents,
      completionPaymentMethod: cashCents > 0 ? completionMethod : null,
      giftCard:
        useGiftCard && lookup.status === "ok" && gcCents > 0
          ? { code: gcCode.trim().toUpperCase(), amountCents: gcCents }
          : undefined,
      sendInvoiceByEmail: sendInvoice,
    };
    onConfirm(payload);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Marquer comme honorée"
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Marquer comme honorée
          </h3>

          {/* Rappel contextuel */}
          <dl
            className="text-xs space-y-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--color-bone)] border border-[var(--color-line)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-ink-500)]">Prix prévu</dt>
              <dd className="text-[var(--color-ink-900)]">
                {(totalPriceCents / 100).toFixed(2)} €
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-ink-500)]">Acompte</dt>
              <dd className="text-[var(--color-ink-900)] text-right">
                {isDepositReceived ? (
                  <>
                    {((depositCents - giftCardAmountCents) / 100).toFixed(2)} €
                    via Stripe
                    {giftCardAmountCents > 0 && (
                      <span className="block text-[10px] text-[var(--color-ink-500)]">
                        + {(giftCardAmountCents / 100).toFixed(2)} € sur carte
                        cadeau
                      </span>
                    )}
                  </>
                ) : paymentMethod === "none" ? (
                  "Aucun (no deposit)"
                ) : (
                  `Aucun acompte versé (${paymentMethodLabelFr(paymentMethod)})`
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3 pt-1 border-t border-[var(--color-line)]">
              <dt className="text-[var(--color-ink-700)]">Reste à percevoir</dt>
              <dd className="text-[var(--color-ink-900)]">
                {(remainingDefault / 100).toFixed(2)} €
              </dd>
            </div>
          </dl>

          {/* Toggle Payer par carte cadeau */}
          <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useGiftCard}
              onChange={(e) => {
                const next = e.target.checked;
                setUseGiftCard(next);
                if (!next) {
                  setGcCode("");
                  setGcAmount("0");
                  setLookup({ status: "idle" });
                  setCompletionAmount((remainingDefault / 100).toFixed(2));
                }
              }}
              disabled={disabled}
              className="sr-only peer"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
                useGiftCard
                  ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-paper)]"
              }`}
            >
              {useGiftCard && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            <span
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Régler (tout ou partie) par carte cadeau
            </span>
          </label>

          {useGiftCard && (
            <div className="space-y-3 pl-7 border-l border-[var(--color-line)] pl-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gcCode}
                  onChange={(e) => {
                    setGcCode(e.target.value);
                    setLookup({ status: "idle" });
                  }}
                  placeholder="GIFT-XXXX-XXXX-XXXX"
                  disabled={disabled || lookupPending}
                  className="flex-1 px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm font-mono focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
                  style={{ fontFamily: "var(--font-ui)" }}
                />
                <button
                  type="button"
                  onClick={checkCode}
                  disabled={disabled || lookupPending || !gcCode.trim()}
                  className="px-4 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {lookupPending ? "…" : "Vérifier"}
                </button>
              </div>

              {lookup.status === "error" && (
                <p
                  role="alert"
                  className="text-xs text-[var(--color-danger)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  ⚠ {lookup.message}
                </p>
              )}

              {lookup.status === "ok" && (
                <div className="space-y-2">
                  <p
                    className="text-xs p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    ✓ Carte <span className="font-mono">••{lookup.prefix}</span>
                    {lookup.recipientName && ` · ${lookup.recipientName}`} · solde{" "}
                    <strong>
                      {(lookup.remainingAmountCents / 100).toFixed(2)} €
                    </strong>
                  </p>
                  <label
                    htmlFor="gc-amount"
                    className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Montant à utiliser sur la carte (€)
                  </label>
                  <input
                    id="gc-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max={(lookup.remainingAmountCents / 100).toFixed(2)}
                    value={gcAmount}
                    onChange={(e) => setGcAmount(e.target.value)}
                    disabled={disabled}
                    className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
                    style={{ fontFamily: "var(--font-ui)" }}
                  />
                  {gcExceedsBalance && (
                    <p
                      role="alert"
                      className="text-xs text-[var(--color-danger)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      Solde insuffisant.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Complément en cash/CB/etc. */}
          <div className="space-y-3">
            <label
              htmlFor="completion-amount"
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Complément perçu hors carte cadeau (€)
            </label>
            <input
              id="completion-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100000"
              value={completionAmount}
              onChange={(e) => setCompletionAmount(e.target.value)}
              disabled={disabled}
              className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
              style={{ fontFamily: "var(--font-ui)" }}
            />

            {cashCents > 0 && (
              <div>
                <label
                  className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)] mb-2"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Mode de paiement du complément
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMPLETION_METHOD_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setCompletionMethod(m.value)}
                      disabled={disabled}
                      className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] transition-colors ${
                        completionMethod === m.value
                          ? "bg-[var(--color-violet-600)] text-white"
                          : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                      }`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p
              className="text-[11px] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Seule cette portion (hors carte cadeau) entre dans le CA mensuel.
            </p>
          </div>

          {/* Résumé total */}
          <div
            className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] border border-[var(--color-violet-100)] flex justify-between"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <span className="text-[var(--color-ink-700)]">Total saisi</span>
            <span className="text-[var(--color-violet-700)] font-semibold">
              {(totalEntered / 100).toFixed(2)} €
              {totalEntered !== remainingDefault && (
                <span className="ml-2 text-[10px] text-[var(--color-ink-500)] font-normal">
                  (attendu {(remainingDefault / 100).toFixed(2)} €)
                </span>
              )}
            </span>
          </div>

          {/* Facture : générée dans tous les cas, la case ne pilote que l'envoi */}
          <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendInvoice}
              onChange={(e) => setSendInvoice(e.target.checked)}
              disabled={disabled}
              className="sr-only peer"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
                sendInvoice
                  ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-paper)]"
              }`}
            >
              {sendInvoice && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            <span>
              <span
                className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Envoyer la facture par email à la cliente
              </span>
              <span
                className="block mt-0.5 text-[11px] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                La facture est générée et archivée dans tous les cas (Finances → Factures).
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
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
              onClick={handleSubmit}
              disabled={disabled || !canValidate}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Valider et marquer honorée
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
