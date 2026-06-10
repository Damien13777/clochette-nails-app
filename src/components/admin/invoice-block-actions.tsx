"use client";

/**
 * Boutons client du bloc Facturation : télécharger / renvoyer (mode document)
 * ou générer en fallback (mode generate). Feedback inline, refresh après action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoiceForSource, resendInvoiceEmail } from "@/lib/actions/invoice-admin";

type Props =
  | { mode: "document"; invoiceId: string }
  | { mode: "generate"; sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK"; sourceId: string };

export function InvoiceBlockActions(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? (result.message ?? "OK") : `⚠ ${result.error}`);
      if (result.ok) router.refresh();
    });
  }

  if (props.mode === "generate") {
    return (
      <div className="space-y-2" style={{ fontFamily: "var(--font-ui)" }}>
        <p className="text-sm text-[var(--color-ink-500)]">
          Aucune facture émise pour cette vente.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              generateInvoiceForSource({ sourceType: props.sourceType, sourceId: props.sourceId }),
            )
          }
          className="px-4 h-9 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-600)] hover:text-white disabled:opacity-50 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pending ? "…" : "Générer la facture"}
        </button>
        {feedback && (
          <p className="text-xs" role="status">
            {feedback}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ fontFamily: "var(--font-ui)" }}>
      <a
        href={`/api/v1/admin/invoices/${props.invoiceId}/download`}
        className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors"
      >
        PDF
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => resendInvoiceEmail(props.invoiceId))}
        className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] disabled:opacity-50 transition-colors"
      >
        {pending ? "…" : "Renvoyer"}
      </button>
      {feedback && <span role="status">{feedback}</span>}
    </div>
  );
}
