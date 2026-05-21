"use client";

/**
 * Form ebook — create + edit.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContentStatus } from "@prisma/client";
import {
  changeEbookStatus,
  createEbook,
  removeEbookCover,
  removeEbookPdf,
  updateEbook,
  uploadEbookCover,
  uploadEbookInlineImage,
  uploadEbookPdf,
} from "@/lib/actions/ebook-admin";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

type Mode = "create" | "edit";

export type EbookFormValues = {
  title: string;
  slug: string;
  shortDesc: string;
  description: string;
  priceEuros: string;
  comparePriceEuros: string;
  tags: string;
  metaTitle: string;
  metaDesc: string;
  coverImageAlt: string;
  coverImage: string | null;
  pdfUrl: string | null;
  pdfSizeBytes: number | null;
  pdfOriginalName: string | null;
  status?: ContentStatus;
};

const DEFAULTS: EbookFormValues = {
  title: "",
  slug: "",
  shortDesc: "",
  description: "",
  priceEuros: "",
  comparePriceEuros: "",
  tags: "",
  metaTitle: "",
  metaDesc: "",
  coverImageAlt: "",
  coverImage: null,
  pdfUrl: null,
  pdfSizeBytes: null,
  pdfOriginalName: null,
};

type Props = {
  mode: Mode;
  ebookId?: string;
  initialValues?: EbookFormValues;
};

export function EbookForm({ mode, ebookId, initialValues }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<EbookFormValues>(
    initialValues ?? DEFAULTS,
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [coverPending, startCoverTransition] = useTransition();
  const [pdfPending, startPdfTransition] = useTransition();

  function update<K extends keyof EbookFormValues>(
    key: K,
    val: EbookFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: val }));
    if (fieldErrors[key as string]) {
      setFieldErrors((errs) => {
        const next = { ...errs };
        delete next[key as string];
        return next;
      });
    }
  }

  function handleTitleChange(title: string) {
    update("title", title);
    if (!slugTouched) update("slug", autoSlug(title));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("slug", values.slug);
    formData.set("shortDesc", values.shortDesc);
    formData.set("description", values.description);
    formData.set("priceEuros", values.priceEuros);
    formData.set("comparePriceEuros", values.comparePriceEuros);
    formData.set("tags", values.tags);
    formData.set("metaTitle", values.metaTitle);
    formData.set("metaDesc", values.metaDesc);
    formData.set("coverImageAlt", values.coverImageAlt);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createEbook(formData)
          : await updateEbook(ebookId!, formData);

      if (result.ok) {
        if (mode === "create" && result.id) {
          router.push(`/admin/ebooks/${result.id}`);
        } else {
          setFeedback("Ebook enregistré.");
          router.refresh();
        }
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function handleStatusChange(status: ContentStatus) {
    if (!ebookId) return;
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await changeEbookStatus(ebookId, status);
      if (result.ok) {
        setFeedback(`Statut mis à jour : ${labelOfStatus(status)}.`);
        setValues((v) => ({ ...v, status }));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!ebookId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startCoverTransition(async () => {
      const res = await uploadEbookCover(ebookId, fd);
      if (res.ok && res.url) {
        update("coverImage", res.url);
        setFeedback("Cover mise à jour.");
      } else if (!res.ok) {
        setError(res.error);
      }
      e.target.value = "";
    });
  }

  function handleCoverRemove() {
    if (!ebookId || !values.coverImage) return;
    if (!confirm("Supprimer la cover ?")) return;
    startCoverTransition(async () => {
      const res = await removeEbookCover(ebookId);
      if (res.ok) {
        update("coverImage", null);
        update("coverImageAlt", "");
      } else {
        setError(res.error);
      }
    });
  }

  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!ebookId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFeedback(null);
    const fd = new FormData();
    fd.append("file", file);
    startPdfTransition(async () => {
      const res = await uploadEbookPdf(ebookId, fd);
      if (res.ok) {
        if (res.pdf) {
          update("pdfUrl", res.pdf.storageKey);
          update("pdfSizeBytes", res.pdf.sizeBytes);
          update("pdfOriginalName", res.pdf.originalName);
        }
        setFeedback("PDF téléversé.");
        router.refresh();
      } else {
        setError(res.error);
      }
      e.target.value = "";
    });
  }

  function handlePdfRemove() {
    if (!ebookId || !values.pdfUrl) return;
    if (
      !confirm(
        "Supprimer le PDF ? Si l'ebook est publié, il repassera automatiquement en brouillon.",
      )
    )
      return;
    startPdfTransition(async () => {
      const res = await removeEbookPdf(ebookId);
      if (res.ok) {
        update("pdfUrl", null);
        update("pdfSizeBytes", null);
        update("pdfOriginalName", null);
        setFeedback("PDF supprimé.");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const currentStatus = values.status ?? "DRAFT";

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <p
          role="alert"
          className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </p>
      )}
      {feedback && !error && (
        <p
          className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ✓ {feedback}
        </p>
      )}

      {/* Identité */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2 className="section-eyebrow">Identité</h2>

        <Field label="Titre" required error={fieldErrors.title}>
          <input
            type="text"
            value={values.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="Le guide complet du semi-permanent"
          />
        </Field>

        <Field
          label="Slug (URL)"
          required
          error={fieldErrors.slug}
          hint={
            !slugTouched
              ? "Auto-généré depuis le titre. Modifie pour personnaliser."
              : undefined
          }
        >
          <input
            type="text"
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update("slug", e.target.value);
            }}
            disabled={isPending}
            className={`${inputCls} font-mono`}
            placeholder="guide-semi-permanent"
          />
        </Field>

        <Field
          label="Pitch court"
          required
          error={fieldErrors.shortDesc}
          hint={`Affiché sur la liste ebooks et en aperçu. ${values.shortDesc.length}/300`}
        >
          <textarea
            rows={2}
            maxLength={300}
            value={values.shortDesc}
            onChange={(e) => update("shortDesc", e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[3rem]`}
          />
        </Field>
      </div>

      {/* Description WYSIWYG */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2 className="section-eyebrow">Description complète</h2>
        <RichTextEditor
          value={values.description}
          onChange={(html) => update("description", html)}
          disabled={isPending}
          toolbarVariant="full"
          minHeightClass="min-h-[20rem]"
          onImageUpload={async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const result = await uploadEbookInlineImage(fd);
            if (!result.ok) throw new Error(result.error);
            return result.url ?? "";
          }}
        />
        {fieldErrors.description && (
          <p
            role="alert"
            className="text-[11px] text-[var(--color-danger)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⚠ {fieldErrors.description}
          </p>
        )}
        <p
          className="text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {values.description.replace(/<[^>]+>/g, "").length} caractères.
        </p>
      </div>

      {/* Prix */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2 className="section-eyebrow">Prix</h2>

        <Field
          label="Prix de vente (€)"
          required
          error={fieldErrors.priceEuros}
          hint="Minimum 0,50 €. Utilise le point ou la virgule comme séparateur."
        >
          <input
            type="number"
            step="0.01"
            min="0.50"
            value={values.priceEuros}
            onChange={(e) => update("priceEuros", e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="9.90"
          />
        </Field>

        <Field
          label="Prix barré (€) — optionnel"
          error={fieldErrors.comparePriceEuros}
          hint="Doit être strictement supérieur au prix de vente. Affiché barré à côté du prix."
        >
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.comparePriceEuros}
            onChange={(e) => update("comparePriceEuros", e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="14.90"
          />
        </Field>
      </div>

      {/* Fichier PDF */}
      {mode === "edit" && (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
          <h2 className="section-eyebrow">Fichier PDF</h2>
          {values.pdfUrl ? (
            <div className="space-y-3">
              <div
                className="flex flex-wrap items-center gap-3 p-3 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                <span className="text-[var(--color-success)]">✓</span>
                <span className="text-[var(--color-ink-900)]">PDF présent</span>
                <span className="text-[var(--color-ink-500)]">·</span>
                <span className="text-[var(--color-ink-700)] font-mono text-xs truncate">
                  {values.pdfOriginalName ?? "ebook.pdf"}
                </span>
                <span className="text-[var(--color-ink-500)]">·</span>
                <span className="text-[var(--color-ink-500)] text-xs">
                  {values.pdfSizeBytes
                    ? `${(values.pdfSizeBytes / 1024 / 1024).toFixed(1)} Mo`
                    : "—"}
                </span>
              </div>
              <div className="flex gap-2">
                <label
                  htmlFor="pdf-upload"
                  className={`inline-flex items-center px-4 h-9 rounded-full text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                    pdfPending
                      ? "opacity-50 cursor-not-allowed"
                      : "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)]/70 border border-[var(--color-violet-600)]/30"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {pdfPending ? "Upload…" : "Remplacer"}
                </label>
                <button
                  type="button"
                  onClick={handlePdfRemove}
                  disabled={pdfPending}
                  className="inline-flex items-center px-4 h-9 rounded-full border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="pdf-upload"
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-dashed border-[var(--color-violet-600)]/50 text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                pdfPending
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-[var(--color-violet-50)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pdfPending ? "Upload…" : "Téléverser le PDF"}
            </label>
          )}
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfUpload}
            disabled={pdfPending}
            className="sr-only"
          />
          <p
            className="text-[11px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Le PDF est requis pour publier l&apos;ebook. Format PDF, max 50 Mo.
          </p>
        </div>
      )}

      {/* Cover image */}
      {mode === "edit" && (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
          <h2 className="section-eyebrow">Image de couverture</h2>
          {values.coverImage ? (
            <div className="space-y-3">
              <div className="rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] bg-[var(--color-bone)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={values.coverImage}
                  alt={values.coverImageAlt || "Aperçu cover"}
                  className="w-full h-auto block"
                />
              </div>
              <Field
                label="Texte alternatif (alt)"
                hint="Pour l'accessibilité + SEO. Décris l'image en quelques mots."
                error={fieldErrors.coverImageAlt}
              >
                <input
                  type="text"
                  value={values.coverImageAlt}
                  onChange={(e) => update("coverImageAlt", e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                  maxLength={200}
                  placeholder="Couverture de l'ebook sur fond pastel"
                />
              </Field>
              <div className="flex gap-2">
                <label
                  htmlFor="cover-upload"
                  className={`inline-flex items-center px-4 h-9 rounded-full text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                    coverPending
                      ? "opacity-50 cursor-not-allowed"
                      : "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)]/70 border border-[var(--color-violet-600)]/30"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Remplacer
                </label>
                <button
                  type="button"
                  onClick={handleCoverRemove}
                  disabled={coverPending}
                  className="inline-flex items-center px-4 h-9 rounded-full border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-danger)]/10 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="cover-upload"
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-dashed border-[var(--color-violet-600)]/50 text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                coverPending
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-[var(--color-violet-50)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {coverPending ? "Upload…" : "Ajouter une cover"}
            </label>
          )}
          <input
            id="cover-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleCoverUpload}
            disabled={coverPending}
            className="sr-only"
          />
        </div>
      )}

      {/* SEO + tags */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2 className="section-eyebrow">SEO & tags</h2>

        <Field
          label="Tags (séparés par des virgules)"
          hint="Max 10 tags. Utilisés pour le SEO et les ebooks connexes."
        >
          <input
            type="text"
            value={values.tags}
            onChange={(e) => update("tags", e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="semi-permanent, guide, debutant"
          />
        </Field>

        <Field
          label="Meta title (SEO)"
          hint={`${values.metaTitle.length}/70 — vide = utilise le titre de l'ebook.`}
        >
          <input
            type="text"
            value={values.metaTitle}
            onChange={(e) => update("metaTitle", e.target.value)}
            disabled={isPending}
            className={inputCls}
            maxLength={70}
          />
        </Field>

        <Field
          label="Meta description (SEO)"
          hint={`${values.metaDesc.length}/160 — vide = utilise le pitch court.`}
        >
          <textarea
            rows={2}
            maxLength={160}
            value={values.metaDesc}
            onChange={(e) => update("metaDesc", e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[3rem]`}
          />
        </Field>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isPending
              ? "Enregistrement…"
              : mode === "create"
                ? "Créer en brouillon"
                : "Enregistrer"}
          </button>
          {mode === "edit" && (
            <button
              type="button"
              onClick={() => router.push("/admin/ebooks")}
              disabled={isPending}
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Retour à la liste
            </button>
          )}
        </div>

        {mode === "edit" && (
          <div className="flex flex-col items-end gap-2">
            {currentStatus !== "PUBLISHED" && !values.pdfUrl && (
              <p
                className="text-[11px] text-[var(--color-warning)] text-right"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                ⚠ Téléverse un PDF avant de publier.
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              {currentStatus !== "PUBLISHED" && (
                <button
                  type="button"
                  onClick={() => handleStatusChange("PUBLISHED")}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-success)]/20 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Publier
                </button>
              )}
              {currentStatus === "PUBLISHED" && (
                <button
                  type="button"
                  onClick={() => handleStatusChange("DRAFT")}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Repasser en brouillon
                </button>
              )}
              {currentStatus !== "ARCHIVED" && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Archiver cet ebook ?"))
                      handleStatusChange("ARCHIVED");
                  }}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-warning)]/30 text-[var(--color-warning)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-warning)]/10 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Archiver
                </button>
              )}
              {currentStatus === "ARCHIVED" && (
                <button
                  type="button"
                  onClick={() => handleStatusChange("DRAFT")}
                  disabled={isPending}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Restaurer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-[var(--color-bone)]/40 border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:bg-[var(--color-paper)] disabled:opacity-50 transition-all";

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span
        className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
        {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span
          className="block text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          role="alert"
          className="block text-[11px] text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {error}
        </span>
      )}
    </label>
  );
}

function autoSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function labelOfStatus(s: ContentStatus): string {
  return s === "PUBLISHED" ? "Publié" : s === "ARCHIVED" ? "Archivé" : "Brouillon";
}
