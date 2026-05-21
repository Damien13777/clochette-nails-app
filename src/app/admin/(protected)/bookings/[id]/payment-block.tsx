/**
 * Affichage du statut paiement sur la fiche admin booking.
 * Adapté au mode de paiement effectif :
 *  - "stripe" : carte bancaire en ligne (avec session + payment intent)
 *  - "cash" | "transfer" | "check" | "card_terminal" : reçu en main propre
 *  - "gift_card_full" : intégralement couvert par une carte cadeau
 *  - "none" : aucun acompte demandé (RDV admin)
 *  - null : pas encore payé (AWAITING_DEPOSIT)
 */

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateTimeFr(d: Date): string {
  return d.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

const PHYSICAL_METHODS: Record<string, string> = {
  cash: "Espèces",
  transfer: "Virement bancaire",
  check: "Chèque",
  card_terminal: "TPE / Carte bancaire (en salon)",
};

type CompletionInfo = {
  revenueCents: number; // cash/CB perçu au markCompleted (hors GC)
  completionPaymentMethod: string | null;
  /** Portion du complément payée par carte cadeau au markCompleted (BOOKING_SERVICE). */
  giftCardServiceCents: number;
  /** Prefix de la GC utilisée au complément (pour identification UI). */
  giftCardServicePrefix: string | null;
  completedAt: Date | null;
};

type Props = {
  paymentMethod: string | null;
  paidAt: Date | null;
  confirmedAt: Date | null;
  depositCents: number;
  /** Portion de l'acompte couverte par carte cadeau (BOOKING_DEPOSIT). */
  giftCardAmountCents: number;
  stripeSessionId: string | null;
  stripePaymentId: string | null;
  createdByAdmin: boolean;
  /** Si défini, on affiche aussi l'encaissement RDV (markCompleted). */
  completion?: CompletionInfo | null;
};

export function PaymentBlock({
  paymentMethod,
  paidAt,
  confirmedAt,
  depositCents,
  giftCardAmountCents,
  stripeSessionId,
  stripePaymentId,
  createdByAdmin,
  completion,
}: Props) {
  const stripePortion = Math.max(0, depositCents - giftCardAmountCents);
  const hasGiftCardPortion = giftCardAmountCents > 0;
  const completionBlock = completion ? renderCompletion(completion) : null;
  // Pas encore payé
  if (!paidAt && !confirmedAt) {
    return (
      <p
        className="text-sm text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        En attente du paiement de l&apos;acompte.
      </p>
    );
  }

  // Stripe (avec ou sans complément carte cadeau)
  if (paymentMethod === "stripe") {
    return (
      <div className="space-y-3">
        <Highlight tone="success">
          💳 Payé par carte bancaire (Stripe) — {formatCents(stripePortion)}
          {hasGiftCardPortion && (
            <span className="block text-xs mt-0.5 opacity-80">
              + {formatCents(giftCardAmountCents)} par carte cadeau (total
              acompte {formatCents(depositCents)})
            </span>
          )}
          {paidAt && (
            <span className="block text-xs mt-0.5 opacity-80">
              le {formatDateTimeFr(paidAt)}
            </span>
          )}
        </Highlight>
        {completionBlock}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stripeSessionId && (
            <Field label="Session ID" value={stripeSessionId} mono truncate />
          )}
          {stripePaymentId && (
            <Field label="Payment Intent" value={stripePaymentId} mono truncate />
          )}
          {confirmedAt && (
            <Field label="Confirmé le" value={formatDateTimeFr(confirmedAt)} />
          )}
        </dl>
      </div>
    );
  }

  // Paiement physique (cash, transfer, check, card_terminal)
  if (paymentMethod && PHYSICAL_METHODS[paymentMethod]) {
    return (
      <div className="space-y-3">
        <Highlight tone="success">
          💵 Payé en {PHYSICAL_METHODS[paymentMethod].toLowerCase()} —{" "}
          {formatCents(depositCents)}
          {paidAt && (
            <span className="block text-xs mt-0.5 opacity-80">
              enregistré le {formatDateTimeFr(paidAt)}
              {createdByAdmin && " (saisi par l'admin)"}
            </span>
          )}
        </Highlight>
        {completionBlock}
      </div>
    );
  }

  // Gift card full
  if (paymentMethod === "gift_card_full") {
    return (
      <div className="space-y-3">
        <Highlight tone="success">
          🎁 Acompte intégralement réglé par carte cadeau —{" "}
          {formatCents(depositCents)}
          {paidAt && (
            <span className="block text-xs mt-0.5 opacity-80">
              le {formatDateTimeFr(paidAt)}
            </span>
          )}
        </Highlight>
        {completionBlock}
      </div>
    );
  }

  // Aucun acompte (RDV admin sans demande d'acompte)
  if (paymentMethod === "none") {
    return (
      <div className="space-y-3">
        <Highlight tone="warning">
          ⭕ Aucun acompte demandé pour ce rendez-vous
          {confirmedAt && (
            <span className="block text-xs mt-0.5 opacity-80">
              RDV confirmé le {formatDateTimeFr(confirmedAt)}
              {createdByAdmin && " (créé par l'admin)"}
            </span>
          )}
        </Highlight>
        {completionBlock}
      </div>
    );
  }

  // Fallback : paidAt présent mais mode inconnu (legacy ou bug)
  return (
    <div className="space-y-3">
      <p
        className="text-sm text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Paiement enregistré
        {paidAt && ` le ${formatDateTimeFr(paidAt)}`}.
      </p>
      {completionBlock}
    </div>
  );
}

function renderCompletion(c: CompletionInfo): React.ReactNode {
  if (c.revenueCents === 0 && c.giftCardServiceCents === 0) return null;
  const cashLabel = (() => {
    switch (c.completionPaymentMethod) {
      case "cash":
        return "Espèces";
      case "card_terminal":
        return "TPE / CB";
      case "transfer":
        return "Virement";
      case "check":
        return "Chèque";
      default:
        return "—";
    }
  })();
  return (
    <div
      className="mt-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)]/40 border border-[var(--color-violet-100)] space-y-1.5 text-sm"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Encaissement du RDV
      </p>
      {c.revenueCents > 0 && (
        <p className="flex justify-between text-[var(--color-ink-900)]">
          <span>{cashLabel}</span>
          <span>{formatCents(c.revenueCents)}</span>
        </p>
      )}
      {c.giftCardServiceCents > 0 && (
        <p className="flex justify-between text-[var(--color-success)]">
          <span>
            Carte cadeau
            {c.giftCardServicePrefix && (
              <span className="ml-1.5 font-mono text-xs text-[var(--color-ink-500)]">
                ••{c.giftCardServicePrefix}
              </span>
            )}
          </span>
          <span>− {formatCents(c.giftCardServiceCents)}</span>
        </p>
      )}
      {c.completedAt && (
        <p className="text-[10px] text-[var(--color-ink-500)] pt-1 border-t border-[var(--color-line)]">
          honoré le {formatDateTimeFr(c.completedAt)}
        </p>
      )}
    </div>
  );
}

// ─── Sous-composants ────────────────────────────────────────

function Highlight({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warning";
}) {
  const cls =
    tone === "success"
      ? "bg-[#f0f9f4] border-[#2d8659]/30 text-[#1d6b48]"
      : "bg-[#fff4e0] border-[#b3651e]/30 text-[#b3651e]";
  return (
    <div
      className={`rounded-[var(--radius-sm)] border px-4 py-3 text-sm ${cls}`}
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div>
      <dt
        className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-500)] mb-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className={`text-sm text-[var(--color-ink-900)] ${mono ? "font-mono text-[12px]" : ""} ${truncate ? "truncate" : ""}`}
        style={mono ? undefined : { fontFamily: "var(--font-ui)" }}
      >
        {value}
      </dd>
    </div>
  );
}
