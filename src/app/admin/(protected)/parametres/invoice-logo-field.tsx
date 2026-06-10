"use client";

/**
 * Champ d'upload du logo de facture (section Facturation des Paramètres).
 *
 * Aperçu de l'image actuelle + remplacement + suppression. Normalisé en PNG
 * côté serveur (react-pdf ne lit ni SVG ni WebP). Même pattern que
 * EmailBannerField.
 */

import { useState, useTransition } from "react";
import { removeInvoiceLogo, uploadInvoiceLogo } from "@/lib/actions/invoice-logo";

export function InvoiceLogoField({ currentUrl }: { currentUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadInvoiceLogo(fd);
      if (res.ok) setUrl(res.url);
      else setError(res.error);
      e.target.value = "";
    });
  }

  function handleRemove() {
    if (!confirm("Supprimer le logo des factures ?")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeInvoiceLogo();
      if (res.ok) setUrl(null);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-2.5">
      <label
        htmlFor="invoice-logo"
        className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Logo en tête de facture
      </label>

      {url && (
        <div className="flex items-center gap-4 p-3 bg-[var(--color-bone)] border border-[var(--color-line)] rounded-[var(--radius-sm)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu simple d'un PNG local, pas d'optimisation nécessaire */}
          <img
            src={url}
            alt="Logo facture actuel"
            className="h-12 w-auto max-w-[220px] object-contain"
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5 disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Supprimer
          </button>
        </div>
      )}

      <input
        id="invoice-logo"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={handleFile}
        disabled={pending}
        className="block w-full text-sm text-[var(--color-ink-700)] file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-[var(--color-violet-600)] file:text-white file:text-xs file:uppercase file:tracking-[0.06em] file:cursor-pointer hover:file:bg-[var(--color-violet-700)] disabled:opacity-50"
        style={{ fontFamily: "var(--font-ui)" }}
      />
      <p
        className="text-[11px] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Converti automatiquement en PNG (format requis pour le PDF). Vide = factures sans logo.
      </p>
      {error && (
        <p
          role="alert"
          className="text-xs text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}
      {pending && (
        <p
          className="text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Traitement…
        </p>
      )}
    </div>
  );
}
