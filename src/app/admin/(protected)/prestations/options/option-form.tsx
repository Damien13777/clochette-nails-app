"use client";

/**
 * Formulaire d'option supplémentaire — create + edit.
 *
 * Champs :
 *  - title, slug (auto-rempli depuis title)
 *  - description (facultatif)
 *  - addedDurationMinutes (0-300, peut être 0)
 *  - addedPriceEuros (0-500, peut être 0)
 *  - applicableCategories (multi-select de ServiceCategory)
 *  - displayOrder
 *
 * Bouton "Publier / Brouillon / Archiver" en mode edit.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContentStatus, ServiceCategory } from "@prisma/client";
import {
  changeServiceOptionStatus,
  createServiceOption,
  updateServiceOption,
} from "@/lib/actions/service-options";
import { DisclaimerField } from "@/components/admin/disclaimer-field";

type Mode = "create" | "edit";

export type OptionFormValues = {
  title: string;
  slug: string;
  description: string;
  addedDurationMinutes: number;
  addedPriceEuros: number;
  applicableCategories: ServiceCategory[];
  displayOrder: number;
  disclaimer: string;
  status?: ContentStatus;
};

const DEFAULTS: OptionFormValues = {
  title: "",
  slug: "",
  description: "",
  addedDurationMinutes: 15,
  addedPriceEuros: 5,
  applicableCategories: [],
  displayOrder: 0,
  disclaimer: "",
};

const CATEGORY_OPTIONS: { value: ServiceCategory; label: string }[] = [
  { value: "POSE_NATURELS", label: "Pose sur ongles naturels" },
  { value: "RALLONGEMENT", label: "Rallongement" },
  { value: "PACK_SPECIAL", label: "Pack spécial" },
  { value: "SOIN_MAINS", label: "Soin mains" },
  { value: "SOIN_PIEDS", label: "Soin pieds" },
  { value: "DEPOSE", label: "Dépose" },
];

type Props = {
  mode: Mode;
  optionId?: string;
  initialValues?: OptionFormValues;
  /** Lien retour (préserve le filtre de la liste d'origine). */
  backHref?: string;
};

export function OptionForm({
  mode,
  optionId,
  initialValues,
  backHref = "/admin/prestations/options",
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<OptionFormValues>(
    initialValues ?? DEFAULTS,
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof OptionFormValues>(
    key: K,
    val: OptionFormValues[K],
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

  function toggleCategory(cat: ServiceCategory) {
    const has = values.applicableCategories.includes(cat);
    update(
      "applicableCategories",
      has
        ? values.applicableCategories.filter((c) => c !== cat)
        : [...values.applicableCategories, cat],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("slug", values.slug);
    formData.set("description", values.description);
    formData.set("addedDurationMinutes", String(values.addedDurationMinutes));
    formData.set("addedPriceEuros", String(values.addedPriceEuros));
    formData.set("applicableCategories", values.applicableCategories.join(","));
    formData.set("displayOrder", String(values.displayOrder));
    formData.set("disclaimer", values.disclaimer);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createServiceOption(formData)
          : await updateServiceOption(optionId!, formData);

      if (result.ok) {
        if (mode === "create") {
          router.push(`/admin/prestations/options/${result.id}`);
        } else {
          setFeedback("Option enregistrée.");
          router.refresh();
        }
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function handleStatusChange(status: ContentStatus) {
    if (!optionId) return;
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await changeServiceOptionStatus(optionId, status);
      if (result.ok) {
        setFeedback(`Statut mis à jour : ${labelOfStatus(status)}.`);
        setValues((v) => ({ ...v, status }));
        router.refresh();
      } else {
        setError(result.error);
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

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Identité
        </h2>

        <Field label="Titre" required error={fieldErrors.title}>
          <input
            type="text"
            value={values.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={isPending}
            className={inputCls}
            placeholder="French manucure, Nail art, Renfort gel…"
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
            placeholder="french-manucure"
          />
        </Field>

        <Field
          label="Description (optionnelle)"
          error={fieldErrors.description}
          hint="Précisions affichées si la cliente survole l'option."
        >
          <textarea
            rows={3}
            maxLength={1000}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[4.5rem]`}
          />
        </Field>
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Impact prestation
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field
            label="Durée ajoutée (min)"
            required
            error={fieldErrors.addedDurationMinutes}
            hint="0 si l'option n'ajoute pas de temps."
          >
            <input
              type="number"
              min={0}
              max={300}
              step={5}
              value={values.addedDurationMinutes}
              onChange={(e) =>
                update("addedDurationMinutes", parseInt(e.target.value, 10) || 0)
              }
              disabled={isPending}
              className={inputCls}
            />
          </Field>

          <Field
            label="Prix ajouté (€)"
            required
            error={fieldErrors.addedPriceEuros}
            hint="Privé, sert au calcul d'acompte."
          >
            <input
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={values.addedPriceEuros}
              onChange={(e) =>
                update("addedPriceEuros", parseFloat(e.target.value) || 0)
              }
              disabled={isPending}
              className={inputCls}
            />
          </Field>

          <Field
            label="Ordre d'affichage"
            error={fieldErrors.displayOrder}
            hint="Plus petit = en premier."
          >
            <input
              type="number"
              min={0}
              max={9999}
              value={values.displayOrder}
              onChange={(e) =>
                update("displayOrder", parseInt(e.target.value, 10) || 0)
              }
              disabled={isPending}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Catégories applicables
        </h2>
        <p
          className="text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Cette option sera proposée aux clientes choisissant l’une de ces
          catégories.
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => {
            const active = values.applicableCategories.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCategory(c.value)}
                disabled={isPending}
                aria-pressed={active}
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-[var(--color-violet-600)] text-white border border-[var(--color-violet-600)]"
                    : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
                }`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {fieldErrors.applicableCategories && (
          <p
            role="alert"
            className="text-[11px] text-[var(--color-danger)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⚠ {fieldErrors.applicableCategories}
          </p>
        )}
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Avertissement (optionnel)
        </h2>
        <DisclaimerField
          value={values.disclaimer}
          onChange={(v) => update("disclaimer", v)}
          disabled={isPending}
          error={fieldErrors.disclaimer}
        />
      </div>

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
              onClick={() => router.push(backHref)}
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
                  if (
                    confirm(
                      "Archiver cette option ? Elle disparaîtra du catalogue public mais reste consultable.",
                    )
                  )
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
                Restaurer (brouillon)
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

function labelOfStatus(s: ContentStatus): string {
  return s === "PUBLISHED" ? "Publiée" : s === "ARCHIVED" ? "Archivée" : "Brouillon";
}
