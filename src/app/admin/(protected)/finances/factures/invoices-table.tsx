"use client";

/**
 * InvoicesTable — lignes factures/avoirs avec actions : télécharger (route
 * download), renvoyer par email (confirm), créer un avoir (modale montant+motif).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCreditNoteAction, resendInvoiceEmail } from "@/lib/actions/invoice-admin";

type Row = {
  id: string;
  number: string;
  docType: "INVOICE" | "CREDIT_NOTE";
  sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK";
  status: "ISSUED" | "CANCELLED";
  customerName: string;
  customerEmail: string;
  totalCents: number;
  issuedAt: string;
  sentAt: string | null;
};

const SOURCE_LABELS: Record<Row["sourceType"], string> = {
  BOOKING: "Prestation",
  GIFT_CARD: "Carte cadeau",
  EBOOK: "Ebook",
};

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function dateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function InvoicesTable({ invoices }: { invoices: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [creditNoteFor, setCreditNoteFor] = useState<Row | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? (result.message ?? "OK") : `⚠ ${result.error}`);
      if (result.ok) {
        setCreditNoteFor(null);
        router.refresh();
      }
    });
  }

  if (invoices.length === 0) {
    return (
      <p
        className="text-sm text-[var(--color-ink-500)] text-center py-12"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Aucune facture pour ces critères.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <p role="status" className="text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          {feedback}
        </p>
      )}

      <div className="overflow-x-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)]">
        <table className="w-full text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] border-b border-[var(--color-line)]">
              <th className="px-4 py-3">Numéro</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vente</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Envoi</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-[var(--color-line)] last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                  {inv.number}
                  {inv.docType === "CREDIT_NOTE" && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-violet-100)] text-[var(--color-violet-700)]">
                      Avoir
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{dateFr(inv.issuedAt)}</td>
                <td className="px-4 py-3">
                  <span className="block">{inv.customerName}</span>
                  <span className="block text-xs text-[var(--color-ink-500)]">
                    {inv.customerEmail}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{SOURCE_LABELS[inv.sourceType]}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{euros(inv.totalCents)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--color-ink-500)]">
                  {inv.sentAt ? `Envoyée le ${dateFr(inv.sentAt)}` : "Non envoyée"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 justify-end text-xs">
                    <a
                      href={`/api/v1/admin/invoices/${inv.id}/download`}
                      className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors whitespace-nowrap"
                    >
                      PDF
                    </a>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Envoyer ${inv.number} à ${inv.customerEmail} ?`)) {
                          run(() => resendInvoiceEmail(inv.id));
                        }
                      }}
                      className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      Renvoyer
                    </button>
                    {inv.docType === "INVOICE" && inv.status === "ISSUED" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setCreditNoteFor(inv)}
                        className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        Avoir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creditNoteFor && (
        <CreditNoteDialog
          invoice={creditNoteFor}
          pending={pending}
          onCancel={() => setCreditNoteFor(null)}
          onConfirm={(amountEuros, reason) =>
            run(() => createCreditNoteAction(creditNoteFor.id, amountEuros, reason))
          }
        />
      )}
    </div>
  );
}

function CreditNoteDialog({
  invoice,
  pending,
  onCancel,
  onConfirm,
}: {
  invoice: Row;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (amountEuros: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState((invoice.totalCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const parsed = Number.parseFloat(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= invoice.totalCents / 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Créer un avoir"
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Avoir sur {invoice.number}
          </h3>
          <p
            className="text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {invoice.customerName} · facture de {euros(invoice.totalCents)}. L&apos;avoir est
            archivé et numéroté (série AV) — il ne déclenche pas de remboursement bancaire.
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="cn-amount"
              className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Montant de l&apos;avoir (€)
            </label>
            <input
              id="cn-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={(invoice.totalCents / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="cn-reason"
              className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Motif (optionnel, visible sur l&apos;avoir)
            </label>
            <input
              id="cn-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Geste commercial, erreur de saisie…"
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="px-4 h-10 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] hover:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onConfirm(parsed, reason)}
              disabled={pending || !valid}
              className="px-5 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pending ? "…" : "Créer l'avoir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
