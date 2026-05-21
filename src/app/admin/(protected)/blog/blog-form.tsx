"use client";

/**
 * Form blog article — create + edit.
 *
 * Éditeur WYSIWYG TipTap (composant générique RichTextEditor réutilisable
 * ailleurs : ebooks, newsletter, etc.).
 *
 * Le contenu HTML produit est stocké tel quel en DB puis sanitizé via
 * lib/sanitize-html.ts au rendu public.
 *
 * Cover image : upload séparé (server action), persiste tout de suite.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BlogCategory, ContentStatus } from "@prisma/client";
import {
  changeBlogPostStatus,
  createBlogPost,
  removeBlogCover,
  updateBlogPost,
  uploadBlogCover,
  uploadBlogInlineImage,
} from "@/lib/actions/blog-admin";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  BLOG_CATEGORY_LABELS,
  BLOG_CATEGORY_VALUES,
} from "@/lib/blog-categories";

type Mode = "create" | "edit";

export type BlogFormValues = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: BlogCategory;
  tags: string;
  metaTitle: string;
  metaDesc: string;
  coverImageAlt: string;
  coverImage: string | null;
  status?: ContentStatus;
  publishedAt?: string | null;
};

const DEFAULTS: BlogFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "CONSEILS",
  tags: "",
  metaTitle: "",
  metaDesc: "",
  coverImageAlt: "",
  coverImage: null,
};

type Props = {
  mode: Mode;
  postId?: string;
  initialValues?: BlogFormValues;
};

export function BlogForm({ mode, postId, initialValues }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BlogFormValues>(
    initialValues ?? DEFAULTS,
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [coverPending, startCoverTransition] = useTransition();
  const [scheduledAt, setScheduledAt] = useState<string>(() =>
    isoToLocalInput(initialValues?.publishedAt),
  );

  function update<K extends keyof BlogFormValues>(
    key: K,
    val: BlogFormValues[K],
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
    formData.set("excerpt", values.excerpt);
    formData.set("content", values.content);
    formData.set("category", values.category);
    formData.set("tags", values.tags);
    formData.set("metaTitle", values.metaTitle);
    formData.set("metaDesc", values.metaDesc);
    formData.set("coverImageAlt", values.coverImageAlt);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createBlogPost(formData)
          : await updateBlogPost(postId!, formData);

      if (result.ok) {
        if (mode === "create" && result.id) {
          router.push(`/admin/blog/${result.id}`);
        } else {
          setFeedback("Article enregistré.");
          router.refresh();
        }
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function handleStatusChange(status: ContentStatus, publishedAtIso?: string) {
    if (!postId) return;
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await changeBlogPostStatus(postId, status, publishedAtIso);
      if (result.ok) {
        setFeedback(
          publishedAtIso && status === "PUBLISHED"
            ? `Publication programmée pour le ${new Date(publishedAtIso).toLocaleString("fr-FR")}.`
            : `Statut mis à jour : ${labelOfStatus(status)}.`,
        );
        setValues((v) => ({
          ...v,
          status,
          publishedAt: publishedAtIso ?? v.publishedAt ?? null,
        }));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSchedule() {
    if (!postId) return;
    if (!scheduledAt) {
      setError("Choisis une date et une heure de publication.");
      return;
    }
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) {
      setError("Date invalide.");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setError("La date doit être dans le futur (sinon utilise « Publier maintenant »).");
      return;
    }
    handleStatusChange("PUBLISHED", d.toISOString());
  }

  function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!postId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startCoverTransition(async () => {
      const res = await uploadBlogCover(postId, fd);
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
    if (!postId || !values.coverImage) return;
    if (!confirm("Supprimer la cover ?")) return;
    startCoverTransition(async () => {
      const res = await removeBlogCover(postId);
      if (res.ok) {
        update("coverImage", null);
        update("coverImageAlt", "");
      } else {
        setError(res.error);
      }
    });
  }

  const currentStatus = values.status ?? "DRAFT";
  const publishedDate = values.publishedAt ? new Date(values.publishedAt) : null;
  const isScheduled =
    currentStatus === "PUBLISHED" &&
    publishedDate !== null &&
    publishedDate.getTime() > Date.now();

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
            placeholder="5 astuces pour préserver sa pose semi-permanente"
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
            placeholder="preserver-pose-semi-permanente"
          />
        </Field>

        <Field
          label="Extrait"
          required
          error={fieldErrors.excerpt}
          hint={`Affiché sur la liste blog + meta description SEO si vide. ${values.excerpt.length}/300`}
        >
          <textarea
            rows={2}
            maxLength={300}
            value={values.excerpt}
            onChange={(e) => update("excerpt", e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[3rem]`}
          />
        </Field>
      </div>

      {/* Contenu WYSIWYG */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2 className="section-eyebrow">Contenu de l&apos;article</h2>
        <RichTextEditor
          value={values.content}
          onChange={(html) => update("content", html)}
          disabled={isPending}
          toolbarVariant="full"
          minHeightClass="min-h-[24rem]"
          onImageUpload={async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const result = await uploadBlogInlineImage(fd);
            if (!result.ok) throw new Error(result.error);
            return result.url ?? "";
          }}
        />
        {fieldErrors.content && (
          <p
            role="alert"
            className="text-[11px] text-[var(--color-danger)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⚠ {fieldErrors.content}
          </p>
        )}
        <p
          className="text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {values.content.replace(/<[^>]+>/g, "").length} caractères ·{" "}
          {readingTimeMinutes(values.content)} min de lecture estimées.
        </p>
      </div>

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
                  placeholder="Mains aux ongles peints en couleur nude"
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
        <h2 className="section-eyebrow">SEO & catégorisation</h2>

        <Field
          label="Catégorie"
          required
          error={fieldErrors.category}
          hint="Sert au filtrage public sur /blog. Une seule catégorie par article."
        >
          <select
            value={values.category}
            onChange={(e) => update("category", e.target.value as BlogCategory)}
            disabled={isPending}
            className={inputCls}
          >
            {BLOG_CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {BLOG_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Tags (séparés par des virgules)"
          hint="Max 10 tags. Utilisés pour le SEO et les articles connexes uniquement (pas affichés en filtre public)."
        >
          <input
            type="text"
            value={values.tags}
            onChange={(e) => update("tags", e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="manucure, entretien, hiver"
          />
        </Field>

        <Field
          label="Meta title (SEO)"
          hint={`${values.metaTitle.length}/70 — vide = utilise le titre de l'article.`}
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
          hint={`${values.metaDesc.length}/160 — vide = utilise l'extrait.`}
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

      {/* Programmation publication (edit mode uniquement) */}
      {mode === "edit" && (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
          <h2 className="section-eyebrow">Programmation</h2>

          {isScheduled && publishedDate && (
            <p
              className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] text-[var(--color-violet-700)] border border-[var(--color-violet-600)]/30"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              ⏱ Article programmé pour le{" "}
              <strong>
                {publishedDate.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                à{" "}
                {publishedDate.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
              . Il n&apos;apparaîtra sur le site qu&apos;à cette date.
            </p>
          )}

          {!isScheduled && currentStatus === "PUBLISHED" && publishedDate && (
            <p
              className="text-xs text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Publié le{" "}
              {publishedDate.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </p>
          )}

          {currentStatus !== "PUBLISHED" && (
            <>
              <Field
                label="Date et heure de publication"
                hint="Choisis un moment dans le futur pour publier automatiquement, ou clique sur « Publier maintenant » plus bas pour mettre en ligne immédiatement."
              >
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={isPending}
                  min={localInputMin()}
                  className={inputCls}
                />
              </Field>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={isPending || !scheduledAt}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
                Programmer la publication
              </button>
            </>
          )}

          {isScheduled && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  handleStatusChange("PUBLISHED", new Date().toISOString())
                }
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-success)]/20 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Publier maintenant
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Annuler la programmation et repasser en brouillon ?"))
                    handleStatusChange("DRAFT");
                }}
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Annuler la programmation
              </button>
            </div>
          )}
        </div>
      )}

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
              onClick={() => router.push("/admin/blog")}
              disabled={isPending}
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Retour à la liste
            </button>
          )}
        </div>

        {mode === "edit" && (
          <div className="flex flex-wrap gap-2">
            {currentStatus !== "PUBLISHED" && (
              <button
                type="button"
                onClick={() => handleStatusChange("PUBLISHED")}
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-success)]/20 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Publier maintenant
              </button>
            )}
            {currentStatus === "PUBLISHED" && !isScheduled && (
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
                  if (confirm("Archiver cet article ?"))
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

function readingTimeMinutes(content: string): number {
  const words = content
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function labelOfStatus(s: ContentStatus): string {
  return s === "PUBLISHED" ? "Publié" : s === "ARCHIVED" ? "Archivé" : "Brouillon";
}

/** Convertit ISO ou Date en valeur "YYYY-MM-DDTHH:mm" pour <input type="datetime-local">. */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minimum acceptable pour le datetime-local : maintenant. */
function localInputMin(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
