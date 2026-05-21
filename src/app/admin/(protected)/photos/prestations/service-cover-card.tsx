"use client";

/**
 * Carte d'une prestation avec sa cover.
 * Similaire à SiteMediaSlot mais pour ServicePhoto featured.
 */

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { ContentStatus } from "@prisma/client";
import {
  deleteServiceCover,
  updateServiceCoverAlt,
  uploadServiceCover,
} from "@/lib/actions/medias";

type Existing = {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  updatedAt: Date;
};

type Props = {
  serviceId: string;
  title: string;
  categoryLabel: string;
  status: ContentStatus;
  existing: Existing | null;
};

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/avif";

const STATUS_LABEL: Record<ContentStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]" },
  PUBLISHED: { label: "Publiée", cls: "bg-[var(--color-success)]/15 text-[var(--color-success)]" },
  ARCHIVED: { label: "Archivée", cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]" },
};

export function ServiceCoverCard({
  serviceId,
  title,
  categoryLabel,
  status,
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

  const statusBadge = STATUS_LABEL[status];

  function pickFile(file: File) {
    setError(null);
    setFeedback(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (!alt) {
      setAlt(title);
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
    formData.set("serviceId", serviceId);
    formData.set("alt", alt.trim());
    formData.set("file", pendingFile);

    startTransition(async () => {
      const result = await uploadServiceCover(formData);
      if (result.ok) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPendingFile(null);
        setPreviewUrl(null);
        setError(null);
        setFeedback("Cover enregistrée.");
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
      const result = await updateServiceCoverAlt(existing.id, alt.trim());
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
        `Supprimer la cover de "${title}" ? La prestation reviendra au placeholder par défaut.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteServiceCover(existing.id);
      if (result.ok) {
        setError(null);
        setFeedback("Cover supprimée.");
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
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden flex flex-col">
      {/* Preview */}
      <div
        className={`relative aspect-[4/3] bg-[var(--color-bone)] ${
          dragActive ? "ring-2 ring-[var(--color-violet-600)] ring-inset" : ""
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
      >
        {displayUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayUrl}
            alt={existing?.alt ?? title}
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
            En attente
          </span>
        )}
        <span
          className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.12em] ${statusBadge.cls}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4 flex-1 flex flex-col">
        <header>
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {categoryLabel}
          </p>
          <h2
            className="text-base mt-1 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h2>
        </header>

        {/* Alt */}
        <div className="space-y-1.5">
          <label
            htmlFor={`alt-${serviceId}`}
            className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Alt <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id={`alt-${serviceId}`}
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            disabled={isPending}
            placeholder="Description courte"
            className="w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⚠ {error}
          </p>
        )}
        {feedback && !error && (
          <p
            className="text-xs p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ✓ {feedback}
          </p>
        )}

        {existing && !showingPending && (
          <dl
            className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-[var(--color-ink-500)] pt-1"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {existing.width && existing.height && (
              <>
                <dt>Dimensions</dt>
                <dd className="text-right">{existing.width} × {existing.height}</dd>
              </>
            )}
            {existing.sizeBytes && (
              <>
                <dt>Poids</dt>
                <dd className="text-right">{(existing.sizeBytes / 1024).toFixed(1)} KB</dd>
              </>
            )}
          </dl>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleInputChange}
          className="sr-only"
          disabled={isPending}
        />

        <div className="flex flex-wrap gap-2 mt-auto pt-2">
          {showingPending ? (
            <>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isPending || alt.trim().length < 3}
                className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {isPending ? "Upload…" : "Enregistrer"}
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
                className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
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
                  Enregistrer texte
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
    <div
      className="absolute inset-0 grid place-items-center text-center px-6"
      style={{
        backgroundColor: "var(--color-rose-50)",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(233,191,196,0.5) 0, rgba(233,191,196,0.5) 1px, transparent 1px, transparent 14px)",
      }}
    >
      <div>
        <div
          className={`mx-auto mb-2 w-10 h-10 rounded-full grid place-items-center transition-colors ${
            dragActive
              ? "bg-[var(--color-violet-600)] text-white"
              : "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </div>
        <p
          className="text-xs text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {dragActive ? "Déposez l'image" : "Glissez ou téléversez"}
        </p>
      </div>
    </div>
  );
}
