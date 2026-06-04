"use client";

/**
 * Bouton "Ajouter des photos" + dialog de multi-upload.
 *
 * Workflow :
 *  1. Clic bouton → ouvre dialog
 *  2. Drag-drop ou file picker → fichiers ajoutés à la liste
 *  3. Pour chaque fichier : preview + alt input (pré-rempli depuis filename)
 *  4. Sélecteur de catégorie unique (applique au batch)
 *  5. "Téléverser tout" → server action séquentielle
 */

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { ServiceCategory } from "@prisma/client";
import { uploadPortfolioPhotos } from "@/lib/actions/medias";

const CATEGORY_OPTIONS: { value: ServiceCategory; label: string }[] = [
  { value: "POSE_NATURELS", label: "Pose sur ongles naturels" },
  { value: "RALLONGEMENT", label: "Rallongements" },
  { value: "PACK_SPECIAL", label: "Packs" },
  { value: "SOIN_MAINS", label: "Soin mains" },
  { value: "SOIN_PIEDS", label: "Soin pieds" },
  { value: "DEPOSE", label: "Dépose" },
];

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/avif";
const MAX_BATCH = 10;

type PendingFile = {
  file: File;
  previewUrl: string;
  alt: string;
};

export function PortfolioUploadButton({
  defaultCategory,
}: {
  defaultCategory: ServiceCategory;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Ajouter des photos
      </button>

      {open && (
        <UploadDialog
          defaultCategory={defaultCategory}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function UploadDialog({
  defaultCategory,
  onClose,
}: {
  defaultCategory: ServiceCategory;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [category, setCategory] = useState<ServiceCategory>(defaultCategory);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addFiles(incoming: FileList | File[]) {
    setError(null);
    const arr = Array.from(incoming);
    const total = files.length + arr.length;
    if (total > MAX_BATCH) {
      setError(`Maximum ${MAX_BATCH} photos par batch (vous avez ${files.length}, +${arr.length}).`);
      return;
    }
    const newPending: PendingFile[] = arr.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      alt: file.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim(),
    }));
    setFiles((curr) => [...curr, ...newPending]);
  }

  function removeAt(idx: number) {
    setFiles((curr) => {
      URL.revokeObjectURL(curr[idx].previewUrl);
      return curr.filter((_, i) => i !== idx);
    });
  }

  function updateAlt(idx: number, alt: string) {
    setFiles((curr) =>
      curr.map((f, i) => (i === idx ? { ...f, alt } : f)),
    );
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function handleSubmit() {
    setError(null);
    if (files.length === 0) {
      setError("Ajoutez au moins une photo.");
      return;
    }
    for (const f of files) {
      if (f.alt.trim().length < 3) {
        setError(`Texte alternatif manquant pour "${f.file.name}".`);
        return;
      }
    }
    const formData = new FormData();
    formData.set("category", category);
    formData.set("alts", JSON.stringify(files.map((f) => f.alt.trim())));
    for (const f of files) formData.append("files", f.file);

    startTransition(async () => {
      const result = await uploadPortfolioPhotos(formData);
      if (result.ok) {
        files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        router.refresh();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  function close() {
    if (isPending) return;
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Téléverser des photos"
      className="fixed inset-0 z-50 bg-black/50 overflow-y-auto"
      onClick={close}
    >
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] w-full max-w-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
            <div>
              <h2
                className="text-base"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Ajouter des photos
              </h2>
              <p
                className="text-xs text-[var(--color-ink-500)] mt-0.5"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Max {MAX_BATCH} photos par batch · JPEG/PNG/WebP/AVIF, 8 MB max
                par fichier
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              aria-label="Fermer"
              className="w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </header>

          <div className="p-5 space-y-4">
            {/* Catégorie */}
            <label className="block space-y-1.5">
              <span
                className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Catégorie (s’applique au batch) <span className="text-[var(--color-danger)]">*</span>
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                disabled={isPending}
                className="w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] disabled:opacity-50"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              className={`rounded-[var(--radius-md)] border-2 border-dashed py-8 px-5 text-center transition-colors ${
                dragActive
                  ? "border-[var(--color-violet-600)] bg-[var(--color-violet-50)]"
                  : "border-[var(--color-line)] bg-[var(--color-bone)]/30"
              }`}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-2 text-[var(--color-violet-700)]"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              <p
                className="text-sm text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {dragActive
                  ? "Déposez vos fichiers"
                  : "Glissez vos photos ici ou"}
              </p>
              {!dragActive && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isPending}
                  className="inline-flex items-center mt-2 px-4 py-1.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Parcourir
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={handleInputChange}
              className="sr-only"
              disabled={isPending}
            />

            {/* Pending files list */}
            {files.length > 0 && (
              <ul className="space-y-2 max-h-[40vh] overflow-y-auto">
                {files.map((f, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 p-2.5 bg-[var(--color-bone)]/30 border border-[var(--color-line)] rounded-[var(--radius-sm)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.previewUrl}
                      alt=""
                      className="shrink-0 w-16 h-16 object-cover rounded-[var(--radius-sm)]"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p
                        className="text-[11px] text-[var(--color-ink-500)] truncate"
                        style={{ fontFamily: "var(--font-ui)" }}
                        title={f.file.name}
                      >
                        {f.file.name} · {(f.file.size / 1024).toFixed(0)} KB
                      </p>
                      <input
                        type="text"
                        value={f.alt}
                        onChange={(e) => updateAlt(idx, e.target.value)}
                        disabled={isPending}
                        placeholder="Texte alternatif (3 chars min)"
                        className="w-full px-2 py-1.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-xs focus:outline-none focus:border-[var(--color-violet-600)] disabled:opacity-50"
                        style={{ fontFamily: "var(--font-ui)" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      disabled={isPending}
                      aria-label="Retirer"
                      className="shrink-0 w-7 h-7 grid place-items-center rounded-full hover:bg-[var(--color-paper)] text-[var(--color-ink-500)] hover:text-[var(--color-danger)] disabled:opacity-50 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 6l12 12M6 18L18 6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p
                role="alert"
                className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                ⚠ {error}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-line)]">
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || files.length === 0}
              className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {isPending
                ? `Téléversement (${files.length})…`
                : `Téléverser ${files.length || ""} ${files.length > 1 ? "photos" : files.length === 1 ? "photo" : ""}`.trim()}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
