"use client";

/**
 * Formulaire de prestation — réutilisé pour create + edit.
 *
 * Props :
 *  - mode : "create" | "edit"
 *  - initialValues : valeurs pré-remplies (edit)
 *  - serviceId : id requis en mode edit
 *
 * Le bouton submit appelle createService OU updateService selon le mode.
 * Le slug est auto-rempli depuis title si l'utilisateur ne l'a pas touché.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContentStatus, ServiceCategory } from "@prisma/client";
import {
  changeServiceStatus,
  createService,
  updateService,
} from "@/lib/actions/services";
import { DisclaimerField } from "@/components/admin/disclaimer-field";

type Mode = "create" | "edit";

export type ServiceFormValues = {
  title: string;
  slug: string;
  shortDesc: string;
  description: string;
  category: ServiceCategory;
  durationMinutes: number;
  priceEuros: number;
  displayOrder: number;
  disclaimer: string;
  status?: ContentStatus;
};

const DEFAULTS: ServiceFormValues = {
  title: "",
  slug: "",
  shortDesc: "",
  description: "",
  category: "POSE_NATURELS",
  durationMinutes: 60,
  priceEuros: 35,
  displayOrder: 0,
  disclaimer: "",
};

const CATEGORY_OPTIONS: { value: ServiceCategory; label: string }[] = [
  { value: "POSE_NATURELS", label: "Pose naturels" },
  { value: "RALLONGEMENT", label: "Rallongement" },
  { value: "PACK_SPECIAL", label: "Pack spécial" },
  { value: "SOIN_MAINS", label: "Soin mains" },
  { value: "SOIN_PIEDS", label: "Soin pieds" },
  { value: "DEPOSE", label: "Dépose" },
];

type Props = {
  mode: Mode;
  serviceId?: string;
  initialValues?: ServiceFormValues;
};

export function ServiceForm({ mode, serviceId, initialValues }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ServiceFormValues>(
    initialValues ?? DEFAULTS,
  );
  const [slugTouched, setSlugTouched] = useState(
    Boolean(initialValues?.slug),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ServiceFormValues>(
    key: K,
    val: ServiceFormValues[K],
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
    if (!slugTouched) {
      // Slug auto-généré tant que l'utilisateur n'a pas édité manuellement
      update("slug", autoSlug(title));
    }
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
    formData.set("category", values.category);
    formData.set("durationMinutes", String(values.durationMinutes));
    formData.set("priceEuros", String(values.priceEuros));
    formData.set("displayOrder", String(values.displayOrder));
    formData.set("disclaimer", values.disclaimer);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createService(formData)
          : await updateService(serviceId!, formData);

      if (result.ok) {
        if (mode === "create") {
          router.push(`/admin/prestations/${result.id}`);
        } else {
          setFeedback("Prestation enregistrée.");
          router.refresh();
        }
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function handleStatusChange(status: ContentStatus) {
    if (!serviceId) return;
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await changeServiceStatus(serviceId, status);
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
            placeholder="Pose ongles naturels — mi-longs"
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
            placeholder="pose-ongles-naturels-mi-longs"
          />
        </Field>

        <Field label="Catégorie" required error={fieldErrors.category}>
          <select
            value={values.category}
            onChange={(e) => update("category", e.target.value as ServiceCategory)}
            disabled={isPending}
            className={inputCls}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Description
        </h2>

        <Field
          label="Description courte"
          required
          error={fieldErrors.shortDesc}
          hint="Affichée sur les cards prestations (max 300 caractères)."
        >
          <textarea
            rows={2}
            maxLength={300}
            value={values.shortDesc}
            onChange={(e) => update("shortDesc", e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[3rem]`}
            placeholder="Manucure russe + pose semi-permanente, finition satinée."
          />
        </Field>

        <Field
          label="Description longue"
          required
          error={fieldErrors.description}
          hint="Affichée sur la page détail prestation."
        >
          <textarea
            rows={6}
            maxLength={5000}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            disabled={isPending}
            className={`${inputCls} resize-y min-h-[8rem]`}
          />
        </Field>
      </div>

      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Durée &amp; tarification
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="Durée" required error={fieldErrors.durationMinutes}>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <select
                  value={Math.floor(values.durationMinutes / 60)}
                  onChange={(e) => {
                    const h = parseInt(e.target.value, 10);
                    const m = values.durationMinutes % 60;
                    update("durationMinutes", h * 60 + m);
                  }}
                  disabled={isPending}
                  className={inputCls}
                  aria-label="Heures"
                >
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                <span className="text-xs text-[var(--color-ink-500)] shrink-0" style={{ fontFamily: "var(--font-ui)" }}>h</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <select
                  value={values.durationMinutes % 60}
                  onChange={(e) => {
                    const m = parseInt(e.target.value, 10);
                    const h = Math.floor(values.durationMinutes / 60);
                    update("durationMinutes", h * 60 + m);
                  }}
                  disabled={isPending}
                  className={inputCls}
                  aria-label="Minutes"
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                  ))}
                </select>
                <span className="text-xs text-[var(--color-ink-500)] shrink-0" style={{ fontFamily: "var(--font-ui)" }}>min</span>
              </div>
            </div>
          </Field>

          <Field
            label="Prix (€)"
            required
            error={fieldErrors.priceEuros}
            hint="Privé, sert au calcul d'acompte."
          >
            <input
              type="number"
              min={5}
              max={1000}
              step={0.5}
              value={values.priceEuros}
              onChange={(e) => update("priceEuros", parseFloat(e.target.value) || 0)}
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
              onChange={(e) => update("displayOrder", parseInt(e.target.value, 10) || 0)}
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
          Avertissement (optionnel)
        </h2>
        <DisclaimerField
          value={values.disclaimer}
          onChange={(v) => update("disclaimer", v)}
          disabled={isPending}
          error={fieldErrors.disclaimer}
        />
      </div>

      {/* Bouton submit + status (edit only) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isPending ? "Enregistrement…" : mode === "create" ? "Créer en brouillon" : "Enregistrer"}
          </button>
          {mode === "edit" && (
            <button
              type="button"
              onClick={() => router.push("/admin/prestations")}
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
                      "Archiver cette prestation ? Elle disparaîtra du catalogue public mais reste consultable.",
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
        {required && (
          <span className="text-[var(--color-danger)] ml-0.5">*</span>
        )}
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
