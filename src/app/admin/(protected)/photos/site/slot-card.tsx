"use client";

/**
 * Carte d'un slot SiteMedia.
 *
 * Trois états :
 *  1. Vide (existing=null) : zone drag-drop + bouton "Choisir un fichier"
 *  2. Rempli : preview + métadonnées + boutons Remplacer / Supprimer
 *  3. En upload : barre de progression visuelle + désactivation
 *
 * Le file picker affiche un input alt obligatoire avant submit.
 */

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  deleteSiteMedia,
  updateSiteMediaAlt,
  uploadSiteMedia,
} from "@/lib/actions/medias";

type Existing = {
  slot: string;
  url: string;
  variants: unknown;
  alt: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  updatedAt: Date;
};

type Props = {
  slotKey: string;
  label: string;
  description: string;
  aspectClass: string;
  recommended: string;
  existing: Existing | null;
};

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/avif";

export function SiteMediaSlot({
  slotKey,
  label,
  description,
  aspectClass,
  recommended,
  existing,
}: Props) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState<string>(existing?.alt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function pickFile(file: File) {
    setError(null);
    setFeedback(null);
    // Revoke previous preview URL pour libérer la mémoire
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (!alt) {
      // Pré-remplit l'alt avec le nom du fichier sans extension
      const base = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
      setAlt(base);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave() {
    setDragActive(false);
  }

  function cancelPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setAlt(existing?.alt ?? "");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleUpload() {
    if (!pendingFile) return;
    if (alt.trim().length < 3) {
      setError("Texte alternatif requis (3 caractères min).");
      return;
    }
    const formData = new FormData();
    formData.set("slot", slotKey);
    formData.set("alt", alt.trim());
    formData.set("file", pendingFile);

    startTransition(async () => {
      const result = await uploadSiteMedia(formData);
      if (result.ok) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPendingFile(null);
        setPreviewUrl(null);
        setError(null);
        setFeedback("Photo enregistrée.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSaveAlt() {
    if (!existing) return;
    if (alt.trim().length < 3) {
      setError("Texte alternatif requis (3 caractères min).");
      return;
    }
    startTransition(async () => {
      const result = await updateSiteMediaAlt(slotKey, alt.trim());
      if (result.ok) {
        setError(null);
        setFeedback("Texte alternatif mis à jour.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete() {
    if (!existing) return;
    if (
      !confirm(
        `Supprimer définitivement la photo "${label}" ? Elle disparaîtra du site immédiatement.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteSiteMedia(slotKey);
      if (result.ok) {
        setError(null);
        setFeedback("Photo supprimée.");
        setAlt("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const altChanged = existing && alt.trim() !== existing.alt;
  const showingPending = pendingFile && previewUrl;
  const displayUrl = showingPending ? previewUrl : existing?.url ?? null;

  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
      {/* Preview area */}
      <div
        className={`relative ${aspectClass} bg-[var(--color-bone)] ${
          dragActive ? "ring-2 ring-[var(--color-violet-600)] ring-inset" : ""
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {displayUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayUrl}
            alt={existing?.alt ?? "Prévisualisation"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <EmptyState dragActive={dragActive} />
        )}
        {showingPending && (
          <span
            className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[var(--color-violet-600)] text-white text-[10px] uppercase tracking-[0.12em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            En attente d’enregistrement
          </span>
        )}
      </div>

      {/* Info & actions */}
      <div className="p-5 space-y-4">
        <header>
          <h2
            className="text-base"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {label}
          </h2>
          <p
            className="text-xs text-[var(--color-ink-500)] mt-1 leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {description}
          </p>
          <p
            className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] mt-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Recommandé : <span className="normal-case tracking-normal">{recommended}</span>
          </p>
        </header>

        {/* Alt text */}
        <div className="space-y-1.5">
          <label
            htmlFor={`alt-${slotKey}`}
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Texte alternatif <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id={`alt-${slotKey}`}
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            disabled={isPending}
            placeholder="Description courte pour les non-voyants et le SEO"
            className="w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⚠ {error}
          </p>
        )}
        {feedback && !error && (
          <p
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ✓ {feedback}
          </p>
        )}

        {/* Métadonnées existantes */}
        {existing && !showingPending && (
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[var(--color-ink-500)] pt-2 border-t border-[var(--color-line)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {existing.width && existing.height && (
              <>
                <dt>Dimensions</dt>
                <dd className="text-right">
                  {existing.width} × {existing.height} px
                </dd>
              </>
            )}
            {existing.sizeBytes && (
              <>
                <dt>Poids (large)</dt>
                <dd className="text-right">
                  {(existing.sizeBytes / 1024).toFixed(1)} KB
                </dd>
              </>
            )}
            <dt>Mis à jour</dt>
            <dd className="text-right">
              {existing.updatedAt.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </dl>
        )}

        {/* Actions */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleInputChange}
          className="sr-only"
          disabled={isPending}
        />

        <div className="flex flex-wrap gap-2 pt-2">
          {showingPending ? (
            <>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isPending || alt.trim().length < 3}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {isPending ? "Upload en cours…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={cancelPending}
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {existing ? "Remplacer" : "Téléverser"}
              </button>
              {existing && altChanged && (
                <button
                  type="button"
                  onClick={handleSaveAlt}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Enregistrer le texte
                </button>
              )}
              {existing && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Supprimer
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ dragActive }: { dragActive: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center">
      <div>
        <div
          className={`mx-auto mb-3 w-12 h-12 rounded-full grid place-items-center transition-colors ${
            dragActive
              ? "bg-[var(--color-violet-600)] text-white"
              : "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </div>
        <p
          className="text-sm text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {dragActive ? "Déposez votre fichier" : "Glissez une image ici"}
        </p>
        <p
          className="text-xs text-[var(--color-ink-500)] mt-1"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ou cliquez sur « Téléverser » ci-dessous
        </p>
      </div>
    </div>
  );
}
