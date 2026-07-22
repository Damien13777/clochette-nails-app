"use client";

/**
 * Step 4 (sous-bloc) — Upload de photos d'inspiration.
 *
 * Sous le champ "Message optionnel".
 * 5 photos max, 5 Mo chaque, JPG/PNG/WebP/HEIC.
 *
 * Upload séquentiel mais parallèle visuellement (chaque photo a son état).
 * Les URLs renvoyées par l'API sont remontées au parent via onChange.
 */

import { useRef, useState } from "react";

export type UploadedFile = {
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

type Slot =
  | { kind: "uploading"; localId: string; previewUrl: string; name: string }
  | { kind: "done"; localId: string; previewUrl: string; file: UploadedFile }
  | { kind: "error"; localId: string; previewUrl: string; name: string; error: string };

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
// Pas de heic/heif : iOS transcode alors automatiquement les photos iPhone en JPEG
// à l'upload (libvips du VPS ne décode pas le HEVC/HEIC → sinon « image illisible »).
const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

type Props = {
  /** URLs déjà uploadées (montrées en done). */
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
};

export function PhotoUpload({ value, onChange, disabled }: Props) {
  // Les slots "done" sont reconstruits depuis `value`. Les slots uploading/error
  // sont dans un state local et fusionnés visuellement.
  const [transient, setTransient] = useState<Slot[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Liste affichée = done (depuis value) + transient (uploading/error)
  const doneSlots: Slot[] = value.map((f) => ({
    kind: "done",
    localId: f.url,
    previewUrl: f.url,
    file: f,
  }));
  const slots: Slot[] = [...doneSlots, ...transient];
  const totalCount = slots.length;
  const remaining = MAX_FILES - totalCount;

  async function handleFilesPicked(filesPicked: FileList | null) {
    if (!filesPicked || filesPicked.length === 0) return;

    const toProcess = Array.from(filesPicked).slice(0, remaining);
    if (toProcess.length === 0) return;

    // On crée d'abord les slots "uploading" pour feedback immédiat
    const newTransient: Slot[] = toProcess.map((f) => ({
      kind: "uploading",
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      previewUrl: URL.createObjectURL(f),
      name: f.name,
    }));
    setTransient((prev) => [...prev, ...newTransient]);

    // Upload séquentiel (limite la charge mémoire serveur sharp)
    let acc = [...value];
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i];
      const slot = newTransient[i];

      // Pré-check côté client (UX) — le serveur revalide
      if (file.size > MAX_BYTES) {
        setTransient((prev) =>
          prev.map((s) =>
            s.localId === slot.localId
              ? {
                  kind: "error",
                  localId: s.localId,
                  previewUrl: slot.previewUrl,
                  name: file.name,
                  error: `Trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`,
                }
              : s,
          ),
        );
        continue;
      }

      const fd = new FormData();
      fd.append("file", file);

      try {
        const res = await fetch("/api/booking/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setTransient((prev) =>
            prev.map((s) =>
              s.localId === slot.localId
                ? {
                    kind: "error",
                    localId: s.localId,
                    previewUrl: slot.previewUrl,
                    name: file.name,
                    error: data.error ?? "Upload échoué.",
                  }
                : s,
            ),
          );
          continue;
        }
        // Succès : retirer du transient + ajouter à value
        setTransient((prev) => prev.filter((s) => s.localId !== slot.localId));
        URL.revokeObjectURL(slot.previewUrl);
        acc = [...acc, data.file];
        onChange(acc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        setTransient((prev) =>
          prev.map((s) =>
            s.localId === slot.localId
              ? {
                  kind: "error",
                  localId: s.localId,
                  previewUrl: slot.previewUrl,
                  name: file.name,
                  error: msg,
                }
              : s,
          ),
        );
      }
    }

    // Reset input pour permettre re-sélection du même fichier
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeDone(url: string) {
    onChange(value.filter((f) => f.url !== url));
  }

  function dismissTransient(localId: string) {
    setTransient((prev) => {
      const target = prev.find((s) => s.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.localId !== localId);
    });
  }

  return (
    <div className="space-y-2">
      <label
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Ajoutez une photo de vos mains et vos inspirations
      </label>
      <p
        className="text-[11px] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Jusqu&apos;à 5 photos · 5 Mo max chacune · JPG, PNG, WebP, HEIC
      </p>

      {/* Grid de thumbnails */}
      {slots.length > 0 && (
        <ul
          className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2"
          aria-label="Photos sélectionnées"
        >
          {slots.map((s) => (
            <li
              key={s.localId}
              className="relative aspect-square rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-bone)] border border-[var(--color-line)]"
            >
              {/* Thumbnail */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.previewUrl}
                alt={
                  s.kind === "done"
                    ? s.file.originalName
                    : s.kind === "error"
                      ? s.name
                      : s.name
                }
                className={`w-full h-full object-cover ${
                  s.kind === "error" ? "opacity-40" : ""
                }`}
              />

              {/* Overlay uploading */}
              {s.kind === "uploading" && (
                <div className="absolute inset-0 grid place-items-center bg-black/40">
                  <div
                    className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"
                    aria-label="Upload en cours"
                  />
                </div>
              )}

              {/* Overlay error */}
              {s.kind === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1.5 bg-[var(--color-danger)]/15">
                  <span className="text-[var(--color-danger)] text-lg">⚠</span>
                  <p
                    className="text-[10px] text-[var(--color-danger)] leading-tight line-clamp-3"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {s.error}
                  </p>
                </div>
              )}

              {/* Bouton supprimer */}
              {!disabled && (s.kind === "done" || s.kind === "error") && (
                <button
                  type="button"
                  onClick={() =>
                    s.kind === "done"
                      ? removeDone(s.file.url)
                      : dismissTransient(s.localId)
                  }
                  aria-label="Supprimer cette photo"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Bouton d'ajout */}
      {remaining > 0 && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            disabled={disabled}
            onChange={(e) => handleFilesPicked(e.target.files)}
            className="sr-only"
            id="photo-upload-input"
          />
          <label
            htmlFor="photo-upload-input"
            className={`mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-dashed border-[var(--color-violet-600)]/50 text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-[var(--color-violet-50)]"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {totalCount === 0
              ? "Ajouter des photos"
              : `Ajouter (${totalCount}/${MAX_FILES})`}
          </label>
        </>
      )}
      {remaining === 0 && (
        <p
          className="text-[11px] text-[var(--color-ink-500)] mt-2"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Limite atteinte ({MAX_FILES}/5). Supprimez une photo pour en ajouter une autre.
        </p>
      )}
    </div>
  );
}
