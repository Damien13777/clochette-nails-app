"use client";

/**
 * Form campagne newsletter — create + edit.
 * Gère également les actions : test, programmer, annuler programmation, envoi immédiat.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NewsletterCampaignStatus } from "@prisma/client";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { KNOWN_SOURCES } from "@/lib/newsletter-sources";
import {
  cancelSchedule,
  createCampaign,
  scheduleCampaign,
  sendCampaignNow,
  sendTestCampaign,
  updateCampaign,
} from "@/lib/actions/newsletter-campaigns";

type AudienceFiltersState = {
  sources: string[];
  createdAfter: string;
  createdBefore: string;
};

type CampaignFormValues = {
  subject: string;
  preheader: string;
  content: string;
  audience: AudienceFiltersState;
};

type Props =
  | { mode: "create" }
  | {
      mode: "edit";
      campaignId: string;
      initialValues: {
        subject: string;
        preheader: string;
        content: string;
        status: NewsletterCampaignStatus;
        scheduledAt: string | null;
        lastTestSentTo: string | null;
        lastTestSentAt: string | null;
        audienceFilters: {
          sources?: string[];
          createdAfter?: string | null;
          createdBefore?: string | null;
        } | null;
      };
    };

const SOURCE_LABELS: Record<string, string> = {
  footer: "Footer du site",
  "blog-cta": "CTA Blog",
  "ebook-thankyou": "Après achat ebook",
  reservation: "Page réservation",
  admin: "Ajoutée manuellement",
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatScheduled(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTestSentAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CampaignForm(props: Props) {
  const router = useRouter();

  const initialAudience: AudienceFiltersState =
    props.mode === "edit"
      ? {
          sources: props.initialValues.audienceFilters?.sources ?? [],
          createdAfter: toDateInputValue(
            props.initialValues.audienceFilters?.createdAfter ?? null,
          ),
          createdBefore: toDateInputValue(
            props.initialValues.audienceFilters?.createdBefore ?? null,
          ),
        }
      : { sources: [], createdAfter: "", createdBefore: "" };

  const [values, setValues] = useState<CampaignFormValues>({
    subject: props.mode === "edit" ? props.initialValues.subject : "",
    preheader: props.mode === "edit" ? props.initialValues.preheader : "",
    content: props.mode === "edit" ? props.initialValues.content : "",
    audience: initialAudience,
  });

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [scheduledAtInput, setScheduledAtInput] = useState<string>(
    props.mode === "edit"
      ? toDatetimeLocalValue(props.initialValues.scheduledAt)
      : "",
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [testPending, startTestTransition] = useTransition();
  const [schedulePending, startScheduleTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();

  const status: NewsletterCampaignStatus =
    props.mode === "edit" ? props.initialValues.status : "DRAFT";
  const isScheduled = status === "SCHEDULED";

  function update<K extends keyof CampaignFormValues>(
    key: K,
    val: CampaignFormValues[K],
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

  function toggleSource(src: string) {
    setValues((v) => {
      const has = v.audience.sources.includes(src);
      const next = has
        ? v.audience.sources.filter((s) => s !== src)
        : [...v.audience.sources, src];
      return { ...v, audience: { ...v.audience, sources: next } };
    });
  }

  const fetchAudienceCount = useCallback(async () => {
    setAudienceLoading(true);
    try {
      const body = {
        sources: values.audience.sources,
        createdAfter: values.audience.createdAfter
          ? new Date(values.audience.createdAfter).toISOString()
          : null,
        createdBefore: values.audience.createdBefore
          ? new Date(values.audience.createdBefore).toISOString()
          : null,
      };
      const res = await fetch("/api/v1/admin/newsletter/audience-count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setAudienceCount(data.count);
      } else {
        setAudienceCount(null);
      }
    } catch {
      setAudienceCount(null);
    } finally {
      setAudienceLoading(false);
    }
  }, [values.audience]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchAudienceCount();
    }, 250);
    return () => clearTimeout(t);
  }, [fetchAudienceCount]);

  function buildFormData(): FormData {
    const formData = new FormData();
    formData.set("subject", values.subject);
    formData.set("preheader", values.preheader);
    formData.set("content", values.content);
    formData.set(
      "audienceFilters",
      JSON.stringify({
        sources: values.audience.sources,
        createdAfter: values.audience.createdAfter
          ? new Date(values.audience.createdAfter).toISOString()
          : null,
        createdBefore: values.audience.createdBefore
          ? new Date(values.audience.createdBefore).toISOString()
          : null,
      }),
    );
    return formData;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const formData = buildFormData();

    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createCampaign(formData)
          : await updateCampaign(props.campaignId, formData);

      if (result.ok) {
        if (props.mode === "create" && result.id) {
          router.push(`/admin/newsletter/campagnes/${result.id}`);
        } else {
          setFeedback("Campagne enregistrée.");
          router.refresh();
        }
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function handleSendTest() {
    if (props.mode !== "edit") return;
    setError(null);
    setFeedback(null);
    startTestTransition(async () => {
      const result = await sendTestCampaign(props.campaignId);
      if (result.ok) {
        setFeedback(result.message ?? "Test envoyé.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSchedule() {
    if (props.mode !== "edit") return;
    if (!scheduledAtInput) {
      setError("Choisis une date et heure pour la programmation.");
      return;
    }
    setError(null);
    setFeedback(null);
    const iso = new Date(scheduledAtInput).toISOString();
    startScheduleTransition(async () => {
      const result = await scheduleCampaign(props.campaignId, iso);
      if (result.ok) {
        setFeedback(result.message ?? "Campagne programmée.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleCancelSchedule() {
    if (props.mode !== "edit") return;
    setError(null);
    setFeedback(null);
    startScheduleTransition(async () => {
      const result = await cancelSchedule(props.campaignId);
      if (result.ok) {
        setFeedback(result.message ?? "Programmation annulée.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSendNow() {
    if (props.mode !== "edit") return;
    const audience = audienceCount ?? 0;
    if (audience <= 0) {
      setError("Aucun destinataire dans l'audience.");
      return;
    }
    const ok = confirm(
      `Envoyer cette campagne à ${audience} destinataire${
        audience > 1 ? "s" : ""
      } ? Action irréversible.`,
    );
    if (!ok) return;
    setError(null);
    setFeedback("Envoi en cours…");
    startSendTransition(async () => {
      const result = await sendCampaignNow(props.campaignId);
      if (result.ok) {
        setFeedback(result.message ?? "Envoi terminé.");
        router.refresh();
      } else {
        setError(result.error);
        setFeedback(null);
      }
    });
  }

  const contentTextLength = values.content.replace(/<[^>]+>/g, "").length;
  const anyPending = isPending || testPending || schedulePending || sendPending;
  const canSendNow = (audienceCount ?? 0) > 0 && !anyPending;

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

      {props.mode === "edit" && isScheduled && props.initialValues.scheduledAt && (
        <div
          className="text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] text-[var(--color-violet-700)] border border-[var(--color-violet-600)]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <span>
            Programmée pour le {formatScheduled(props.initialValues.scheduledAt)}.
          </span>
          <button
            type="button"
            onClick={handleCancelSchedule}
            disabled={schedulePending || anyPending}
            className="inline-flex items-center px-4 h-8 rounded-full border border-[var(--color-violet-600)]/30 text-[var(--color-violet-700)] text-[11px] uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Annuler la programmation
          </button>
        </div>
      )}

      {/* Identité */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2 className="section-eyebrow">Identité</h2>

        <Field
          label="Sujet"
          required
          error={fieldErrors.subject}
          hint={`${values.subject.length}/200 — apparaît dans la boîte mail.`}
        >
          <input
            type="text"
            value={values.subject}
            onChange={(e) => update("subject", e.target.value)}
            disabled={anyPending}
            className={inputCls}
            maxLength={200}
            placeholder="Nouvelles couleurs pour l'automne"
          />
        </Field>

        <Field
          label="Preheader"
          error={fieldErrors.preheader}
          hint="Texte preview qui apparaît à côté du sujet dans Gmail. Optionnel mais conseillé."
        >
          <input
            type="text"
            value={values.preheader}
            onChange={(e) => update("preheader", e.target.value)}
            disabled={anyPending}
            className={inputCls}
            maxLength={200}
            placeholder="Un avant-goût de la palette de la saison…"
          />
        </Field>
      </div>

      {/* Contenu */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2 className="section-eyebrow">Contenu</h2>
        <RichTextEditor
          value={values.content}
          onChange={(html) => update("content", html)}
          disabled={anyPending}
          toolbarVariant="full"
          minHeightClass="min-h-[20rem]"
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
          {contentTextLength} caractères (texte brut, 30 min · 100 000 max).
        </p>
      </div>

      {/* Audience */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2 className="section-eyebrow">Audience</h2>

        <div className="space-y-2">
          <span
            className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sources
          </span>
          <div className="flex flex-wrap gap-2">
            {KNOWN_SOURCES.map((src) => {
              const checked = values.audience.sources.includes(src);
              return (
                <label
                  key={src}
                  className={`inline-flex items-center gap-2 px-3 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] border cursor-pointer transition-colors ${
                    checked
                      ? "bg-[var(--color-violet-600)] text-white border-[var(--color-violet-600)]"
                      : "bg-[var(--color-paper)] text-[var(--color-ink-700)] border-[var(--color-line)] hover:bg-[var(--color-bone)]"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(src)}
                    disabled={anyPending}
                    className="sr-only"
                  />
                  {SOURCE_LABELS[src] ?? src}
                </label>
              );
            })}
          </div>
          <p
            className="text-[11px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune sélection = toutes les sources.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Inscrites après le">
            <input
              type="date"
              value={values.audience.createdAfter}
              onChange={(e) =>
                update("audience", {
                  ...values.audience,
                  createdAfter: e.target.value,
                })
              }
              disabled={anyPending}
              className={inputCls}
            />
          </Field>
          <Field label="Inscrites avant le">
            <input
              type="date"
              value={values.audience.createdBefore}
              onChange={(e) =>
                update("audience", {
                  ...values.audience,
                  createdBefore: e.target.value,
                })
              }
              disabled={anyPending}
              className={inputCls}
            />
          </Field>
        </div>

        <div
          className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-bone)]/50 border border-[var(--color-line)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <p className="text-sm text-[var(--color-ink-900)]">
            {audienceLoading ? (
              <span className="text-[var(--color-ink-500)]">Calcul…</span>
            ) : audienceCount === null ? (
              <span className="text-[var(--color-ink-500)]">—</span>
            ) : (
              <>
                <span
                  className="text-2xl"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {audienceCount}
                </span>{" "}
                <span className="text-[var(--color-ink-500)] text-xs">
                  destinataire{audienceCount > 1 ? "s" : ""} correspondent
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-5">
        <h2 className="section-eyebrow">Actions</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={anyPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isPending
              ? "Enregistrement…"
              : props.mode === "create"
                ? "Créer en brouillon"
                : "Enregistrer"}
          </button>

          {props.mode === "edit" && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={anyPending}
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {testPending ? "Envoi du test…" : "Envoyer un test à moi-même"}
            </button>
          )}
        </div>

        {props.mode === "edit" &&
          props.initialValues.lastTestSentTo &&
          props.initialValues.lastTestSentAt && (
            <p
              className="text-[11px] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Dernier test envoyé à {props.initialValues.lastTestSentTo} le{" "}
              {formatTestSentAt(props.initialValues.lastTestSentAt)}.
            </p>
          )}

        {props.mode === "edit" && (
          <div className="pt-3 border-t border-[var(--color-line)] space-y-3">
            <p
              className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Programmer la publication
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={scheduledAtInput}
                onChange={(e) => setScheduledAtInput(e.target.value)}
                disabled={anyPending}
                className={`${inputCls} max-w-[18rem]`}
              />
              <button
                type="button"
                onClick={handleSchedule}
                disabled={anyPending || !scheduledAtInput}
                className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {schedulePending
                  ? "Programmation…"
                  : isScheduled
                    ? "Reprogrammer"
                    : "Programmer"}
              </button>
            </div>
          </div>
        )}

        {props.mode === "edit" && (
          <div className="pt-3 border-t border-[var(--color-line)] space-y-3">
            <p
              className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Envoi immédiat
            </p>
            {canSendNow ? (
              <button
                type="button"
                onClick={handleSendNow}
                disabled={anyPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-danger)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-danger)]/90 disabled:opacity-50 transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {sendPending
                  ? "Envoi en cours…"
                  : `Envoyer maintenant à ${audienceCount} destinataire${
                      (audienceCount ?? 0) > 1 ? "s" : ""
                    }`}
              </button>
            ) : (
              <p
                className="text-[11px] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Audience vide : ajuste les filtres pour pouvoir envoyer.
              </p>
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
