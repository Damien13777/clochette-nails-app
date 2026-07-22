"use client";

/**
 * TransactionsTable — Client Component.
 *
 * Liste des transactions filtrables (type, mode paiement) + bouton export CSV
 * qui POST /api/v1/admin/finances/export et déclenche le download via blob.
 * Pagination simple 50/page.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FinanceTransaction,
  TransactionType,
} from "@/lib/finances";

type Props = {
  transactions: FinanceTransaction[];
  fromIso: string;
  toIso: string;
};

const PAGE_SIZE = 50;

const TYPE_OPTIONS: { value: "all" | TransactionType; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "booking", label: "RDV" },
  { value: "gift_card", label: "Carte cadeau" },
  { value: "ebook", label: "Ebook" },
];

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "stripe", label: "Stripe" },
  { value: "gift_card_full", label: "Carte cadeau (100 %)" },
  { value: "cash", label: "Espèces" },
  { value: "salon", label: "Salon" },
  { value: "autre", label: "Autre" },
];

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeFor(type: TransactionType): {
  label: string;
  cls: string;
} {
  if (type === "booking") {
    return {
      label: "RDV",
      cls: "bg-[var(--color-violet-50)] text-[var(--color-violet-700)]",
    };
  }
  if (type === "gift_card") {
    return {
      label: "Carte cadeau",
      cls: "bg-[var(--color-gold-50)] text-[var(--color-gold-600)]",
    };
  }
  return {
    label: "Ebook",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
  };
}

function normalizePayment(method: string): string {
  const m = method.toLowerCase().trim();
  if (m === "stripe") return "stripe";
  if (m === "gift_card_full") return "gift_card_full";
  if (m === "cash" || m === "espèces" || m === "especes") return "cash";
  if (m === "salon") return "salon";
  return "autre";
}

export function TransactionsTable({ transactions, fromIso, toIso }: Props) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function handleRowClick(url: string, e: React.MouseEvent) {
    // Cmd+clic / Ctrl+clic / middle-click → ouvrir nouvel onglet
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      window.open(url, "_blank");
      return;
    }
    router.push(url);
  }

  const filtered = useMemo(() => {
    let out = transactions;
    if (typeFilter !== "all") {
      out = out.filter((t) => t.type === typeFilter);
    }
    if (paymentFilter !== "all") {
      out = out.filter((t) => normalizePayment(t.paymentMethod) === paymentFilter);
    }
    return [...out].sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  }, [transactions, typeFilter, paymentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/v1/admin/finances/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromIso, to: toIso }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setExportError(text || `Erreur ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] ?? "finances.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Journal
          </p>
          <h2
            className="text-xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Transactions
          </h2>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="h-9 px-4 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-700)] text-white hover:bg-[var(--color-violet-600)] disabled:opacity-50 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {exporting ? "Export…" : "Exporter CSV"}
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Type">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as "all" | TransactionType);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode paiement">
          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-paper)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {PAYMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <p
          className="ml-auto text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {filtered.length} transaction{filtered.length > 1 ? "s" : ""}
        </p>
      </div>

      {filtered.some((t) => t.refundedInGrossCents > 0) && (
        <p
          className="mb-3 text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          * Remboursement déjà déduit du brut : il porte sa propre ligne négative
          à sa date. Ne pas le soustraire une seconde fois.
        </p>
      )}

      {exportError && (
        <p
          className="mb-3 text-sm text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Export impossible : {exportError}
        </p>
      )}

      {filtered.length === 0 ? (
        <div
          className="py-10 text-center text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune transaction sur cette période
        </div>
      ) : (
        <>
          {/* ── Vue mobile : cards empilées ─────────────── */}
          <ul className="md:hidden space-y-2.5">
            {slice.map((t) => {
              const b = badgeFor(t.type);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={(e) => handleRowClick(t.detailUrl, e)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        window.open(t.detailUrl, "_blank");
                      }
                    }}
                    className="w-full text-left bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] p-4 hover:border-[var(--color-violet-600)]/40 hover:bg-[var(--color-violet-50)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)]/30 transition-all"
                    aria-label={`${b.label} · ${t.ref} · ${formatEuro(t.netCents)} net · Voir le détail`}
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {/* Header card : badge type + Net en gros */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        <span
                          className={`inline-flex items-center self-start whitespace-nowrap px-2 h-5 rounded-full text-[10px] uppercase tracking-[0.06em] ${b.cls}`}
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {b.label}
                        </span>
                        <span className="text-[11px] text-[var(--color-ink-500)] whitespace-nowrap">
                          {formatDateTime(t.dateIso)}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-lg tabular-nums text-[var(--color-violet-700)]"
                          style={{ fontFamily: "var(--font-serif)" }}
                        >
                          {formatEuro(t.netCents)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-500)]">
                          Net
                        </div>
                      </div>
                    </div>

                    {/* Client */}
                    <div className="mb-2">
                      <p className="text-sm text-[var(--color-ink-900)] truncate">
                        {t.clientName || "—"}
                      </p>
                      <p className="text-[11px] text-[var(--color-ink-500)] truncate">
                        {t.clientEmail}
                      </p>
                    </div>

                    {/* Détails financiers */}
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] pt-2 border-t border-[var(--color-line)]/60">
                      <DetailItem label="Réf">
                        <code className="text-[11px] text-[var(--color-ink-700)]">
                          {t.ref}
                        </code>
                      </DetailItem>
                      <DetailItem label="Mode">
                        <span className="text-[var(--color-ink-700)]">
                          {t.paymentMethod}
                        </span>
                      </DetailItem>
                      <DetailItem label="Brut">
                        <span className="tabular-nums text-[var(--color-ink-700)]">
                          {formatEuro(t.grossCents)}
                        </span>
                      </DetailItem>
                      {t.giftCardUsedCents > 0 && (
                        <DetailItem label="Carte cadeau">
                          <span className="tabular-nums text-[var(--color-gold-600)]">
                            −{formatEuro(t.giftCardUsedCents)}
                          </span>
                        </DetailItem>
                      )}
                      {t.stripeFeeCents > 0 && (
                        <DetailItem label="Frais Stripe">
                          <span className="tabular-nums text-[var(--color-ink-500)]">
                            −{formatEuro(t.stripeFeeCents)}
                          </span>
                        </DetailItem>
                      )}
                      {t.refundedCents > 0 && (
                        <DetailItem
                          label={
                            t.refundedInGrossCents > 0
                              ? "Remboursé (déjà dans le brut)"
                              : "Remboursé"
                          }
                        >
                          <span className="tabular-nums text-[var(--color-warning)]">
                            {t.refundedInGrossCents > 0 ? "" : "−"}
                            {formatEuro(t.refundedCents)}
                          </span>
                        </DetailItem>
                      )}
                    </dl>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── Vue desktop : table 10 colonnes ─────────── */}
          <div className="hidden md:block overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm" style={{ fontFamily: "var(--font-ui)" }}>
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] border-b border-[var(--color-line)]">
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Réf</Th>
                  <Th>Client</Th>
                  <Th>Mode</Th>
                  <Th align="right">Brut</Th>
                  <Th align="right">Carte cadeau</Th>
                  <Th align="right">Frais</Th>
                  <Th align="right">Remboursé</Th>
                  <Th align="right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {slice.map((t) => {
                  const b = badgeFor(t.type);
                  return (
                    <tr
                      key={t.id}
                      onClick={(e) => handleRowClick(t.detailUrl, e)}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          window.open(t.detailUrl, "_blank");
                        }
                      }}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(t.detailUrl);
                        }
                      }}
                      title={`Voir le détail · ${t.detailUrl}`}
                      className="cursor-pointer border-b border-[var(--color-line)]/70 hover:bg-[var(--color-violet-50)]/40 transition-colors focus:outline-none focus:bg-[var(--color-violet-50)]/60"
                    >
                      <Td>
                        <span className="text-[var(--color-ink-700)] whitespace-nowrap">
                          {formatDateTime(t.dateIso)}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-2 h-5 rounded-full text-[10px] uppercase tracking-[0.06em] ${b.cls}`}
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {b.label}
                        </span>
                      </Td>
                      <Td>
                        <code
                          className="text-xs text-[var(--color-ink-500)]"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {t.ref}
                        </code>
                      </Td>
                      <Td>
                        <div className="min-w-0">
                          <p className="truncate text-[var(--color-ink-900)] max-w-[200px]">
                            {t.clientName || "—"}
                          </p>
                          <p className="truncate text-[11px] text-[var(--color-ink-500)] max-w-[200px]">
                            {t.clientEmail}
                          </p>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[var(--color-ink-700)] whitespace-nowrap">
                          {t.paymentMethod}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tabular-nums">{formatEuro(t.grossCents)}</span>
                      </Td>
                      <Td align="right">
                        <span className="tabular-nums text-[var(--color-ink-500)]">
                          {t.giftCardUsedCents > 0 ? formatEuro(t.giftCardUsedCents) : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tabular-nums text-[var(--color-ink-500)]">
                          {t.stripeFeeCents > 0 ? formatEuro(t.stripeFeeCents) : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="tabular-nums text-[var(--color-warning)]"
                          title={
                            t.refundedInGrossCents > 0
                              ? "Déjà déduit du brut (ligne négative datée) — ne pas soustraire une seconde fois"
                              : undefined
                          }
                        >
                          {t.refundedCents > 0 ? formatEuro(t.refundedCents) : "—"}
                          {t.refundedInGrossCents > 0 && (
                            <span className="text-[var(--color-ink-500)]"> *</span>
                          )}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="tabular-nums text-[var(--color-violet-700)]"
                          style={{ fontFamily: "var(--font-serif)" }}
                        >
                          {formatEuro(t.netCents)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p
                className="text-xs text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Page {safePage} sur {pageCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-8 px-3 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage === pageCount}
                  className="h-8 px-3 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 font-normal ${align === "right" ? "text-right" : "text-left"}`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-3 py-3 align-top ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-500)] shrink-0">
        {label}
      </dt>
      <dd className="text-right truncate">{children}</dd>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
