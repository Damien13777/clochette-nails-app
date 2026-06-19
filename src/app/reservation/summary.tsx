"use client";

/**
 * Récap réservation — desktop sticky + mobile bottom bar.
 *
 * Affiche un « montant estimé » (prestation + options sélectionnées) — c'est une
 * estimation indicative, le total final peut varier (ajustements le jour du RDV).
 * L'acompte éventuel est calculé server-side.
 */

import type { OptionLite, ServiceLite } from "./reservation-flow";

function formatDuration(minutes: number): string {
  if (minutes === 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type Props = {
  service: ServiceLite | null;
  options: OptionLite[];
  totalDuration: number;
  totalPriceCents: number;
  date: string | null;
  startTime: string | null;
  stripeConfigured: boolean;
  depositCents: number;
  giftCardApplied: number;
  remainingDeposit: number;
  compact?: boolean;
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function ReservationSummary({
  service,
  options,
  totalDuration,
  totalPriceCents,
  date,
  startTime,
  stripeConfigured,
  depositCents,
  giftCardApplied,
  remainingDeposit,
  compact = false,
}: Props) {
  // Mode compact (mobile bottom bar)
  if (compact) {
    return (
      <div style={{ fontFamily: "var(--font-ui)" }}>
        {/* Ligne haute : service + durée */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Votre réservation
            </p>
            {service ? (
              <p className="text-sm font-medium truncate">{service.title}</p>
            ) : (
              <p className="text-sm text-[var(--color-ink-500)]">
                Sélectionnez une prestation
              </p>
            )}
            {date && startTime && (
              <p className="text-xs text-[var(--color-ink-500)] truncate">
                {formatDateFr(new Date(date))} · {startTime}
              </p>
            )}
          </div>
          {totalDuration > 0 && (
            <span
              className="shrink-0 px-2.5 py-1 rounded-full bg-[var(--color-violet-100)] text-[var(--color-violet-700)] text-xs"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatDuration(totalDuration)}
            </span>
          )}
        </div>

        {/* Breakdown : montant estimé + acompte */}
        {service && (
          <div className="mt-2 pt-2 border-t border-[var(--color-line)] space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span
                className="uppercase tracking-[0.12em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Montant estimé
              </span>
              <span style={{ fontFamily: "var(--font-serif)" }}>
                {service.priceCents === 0
                  ? "Sur devis"
                  : formatCents(totalPriceCents)}
              </span>
            </div>
            {depositCents > 0 &&
              (giftCardApplied > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-success)]">
                    Code cadeau −{formatCents(giftCardApplied)}
                  </span>
                  <span
                    className="text-[var(--color-violet-700)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    À payer&nbsp;<strong>{formatCents(remainingDeposit)}</strong>
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span
                    className="uppercase tracking-[0.12em] text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Acompte
                  </span>
                  <span style={{ fontFamily: "var(--font-serif)" }}>
                    {formatCents(depositCents)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  // Mode complet (desktop sticky aside)
  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
      <p
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Votre réservation
      </p>

      {!service ? (
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Sélectionnez une prestation pour commencer.
        </p>
      ) : (
        <>
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] mb-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prestation
            </p>
            <p
              className="text-base leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {service.title}
            </p>
          </div>

          {options.length > 0 && (
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] mb-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Options
              </p>
              <ul
                className="text-sm space-y-0.5"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {options.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <span className="truncate">{o.title}</span>
                    <span className="text-[var(--color-ink-500)] shrink-0">
                      + {o.addedDurationMinutes} min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--color-line)]">
            <div className="flex justify-between items-baseline">
              <span
                className="text-xs text-[var(--color-ink-500)] uppercase tracking-[0.14em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Durée totale
              </span>
              <span
                className="text-base"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {formatDuration(totalDuration)}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--color-line)]">
            <div className="flex justify-between items-baseline">
              <span
                className="text-xs text-[var(--color-ink-500)] uppercase tracking-[0.14em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Montant estimé
              </span>
              <span
                className="text-base text-[var(--color-violet-700)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {service.priceCents === 0
                  ? "Sur devis"
                  : formatCents(totalPriceCents)}
              </span>
            </div>
            {service.priceCents > 0 && (
              <p
                className="mt-1.5 text-[10px] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Prestation + options · ajustable le jour du RDV
              </p>
            )}
          </div>

          {date && startTime && (
            <div className="pt-4 border-t border-[var(--color-line)]">
              <p
                className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] mb-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Créneau
              </p>
              <p
                className="text-sm capitalize"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {formatDateFr(new Date(date))} · {startTime}
              </p>
            </div>
          )}

          {depositCents > 0 && (
            <div className="pt-4 border-t border-[var(--color-line)] space-y-1.5">
              <p
                className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Acompte
              </p>
              <div
                className="flex justify-between items-baseline text-sm"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                <span className="text-[var(--color-ink-500)]">Demandé</span>
                <span
                  className={
                    giftCardApplied > 0
                      ? "text-[var(--color-ink-500)] line-through"
                      : "text-[var(--color-ink-900)]"
                  }
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {formatCents(depositCents)}
                </span>
              </div>
              {giftCardApplied > 0 && (
                <div
                  className="flex justify-between items-baseline text-sm"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  <span className="text-[var(--color-success)]">Code cadeau</span>
                  <span className="text-[var(--color-success)]">
                    − {formatCents(giftCardApplied)}
                  </span>
                </div>
              )}
              <div
                className="flex justify-between items-baseline pt-1.5 mt-1.5 border-t border-[var(--color-line)] text-base"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
                  À payer maintenant
                </span>
                <span
                  className="text-[var(--color-violet-700)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {formatCents(remainingDeposit)}
                </span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--color-line)]">
            <p
              className="text-xs text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {stripeConfigured ? (
                <>
                  Paiement sécurisé de l&apos;acompte via Stripe. Annulation
                  gratuite jusqu&apos;à 72h avant le RDV.
                </>
              ) : (
                <em>Mode dev : confirmation directe sans paiement.</em>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
