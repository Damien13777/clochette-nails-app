"use client";

/**
 * TestimonialsManager — liste CRUD des avis (client component).
 *
 * Modale bespoke (même pattern overlay que les dialogs booking-actions),
 * réordonnancement par flèches, toggle publier, suppression avec confirm().
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  toggleTestimonialPublished,
  reorderTestimonial,
  updateTestimonialsGoogleLine,
  type TestimonialInput,
} from "@/lib/actions/testimonials-admin";

type Item = {
  id: string;
  quote: string;
  rating: number;
  authorName: string;
  authorLabel: string | null;
  published: boolean;
};

type ActionOutcome = { ok: boolean; message?: string; error?: string };

export function TestimonialsManager({
  initial,
  googleLine,
}: {
  initial: Item[];
  googleLine: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [googleValue, setGoogleValue] = useState(googleLine);

  function run(action: () => Promise<ActionOutcome>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFeedback(`⚠ ${result.error ?? "Erreur inconnue"}`);
      } else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2
          className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Ligne Google (sous le titre de la section)
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={googleValue}
            onChange={(e) => setGoogleValue(e.target.value)}
            placeholder="4,9 / 5 · 87 avis Google (vide = masquée)"
            className="flex-1 px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
            style={{ fontFamily: "var(--font-ui)" }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => updateTestimonialsGoogleLine(googleValue))}
            className="px-4 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Enregistrer
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {initial.length} avis · {initial.filter((t) => t.published).length} publié(s)
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="px-5 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          + Ajouter un avis
        </button>
      </div>

      {feedback && (
        <p
          role="alert"
          className="text-sm text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {feedback}
        </p>
      )}

      <ul className="space-y-3">
        {initial.map((t, idx) => (
          <li
            key={t.id}
            className={`bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-4 flex gap-4 ${t.published ? "" : "opacity-60"}`}
          >
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                aria-label="Monter"
                disabled={pending || idx === 0}
                onClick={() => run(() => reorderTestimonial(t.id, "up"))}
                className="w-8 h-8 grid place-items-center rounded border border-[var(--color-line)] text-[var(--color-ink-700)] hover:border-[var(--color-violet-600)] disabled:opacity-30 transition-colors"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Descendre"
                disabled={pending || idx === initial.length - 1}
                onClick={() => run(() => reorderTestimonial(t.id, "down"))}
                className="w-8 h-8 grid place-items-center rounded border border-[var(--color-line)] text-[var(--color-ink-700)] hover:border-[var(--color-violet-600)] disabled:opacity-30 transition-colors"
              >
                ↓
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-sm italic text-[var(--color-ink-900)] line-clamp-2"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                « {t.quote} »
              </p>
              <p
                className="mt-2 text-xs text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {"★".repeat(t.rating)}
                {"☆".repeat(5 - t.rating)} · {t.authorName}
                {t.authorLabel ? ` · ${t.authorLabel}` : ""}
                {t.published ? "" : " · (dépublié)"}
              </p>
            </div>

            <div
              className="flex flex-col gap-1.5 shrink-0 text-xs"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(t)}
                className="px-3 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors"
              >
                Éditer
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => toggleTestimonialPublished(t.id))}
                className="px-3 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors"
              >
                {t.published ? "Dépublier" : "Publier"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Supprimer l'avis de ${t.authorName} ?`)) {
                    run(() => deleteTestimonial(t.id));
                  }
                }}
                className="px-3 py-1.5 rounded border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>

      {initial.length === 0 && (
        <p
          className="text-sm text-[var(--color-ink-500)] text-center py-8"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucun avis. La section sera masquée sur la landing.
        </p>
      )}

      {editing !== null && (
        <TestimonialDialog
          item={editing === "new" ? null : editing}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            run(() =>
              editing === "new" ? createTestimonial(input) : updateTestimonial(editing.id, input),
            )
          }
        />
      )}
    </div>
  );
}

function TestimonialDialog({
  item,
  pending,
  onCancel,
  onSubmit,
}: {
  item: Item | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: TestimonialInput) => void;
}) {
  const [quote, setQuote] = useState(item?.quote ?? "");
  const [rating, setRating] = useState(item?.rating ?? 5);
  const [authorName, setAuthorName] = useState(item?.authorName ?? "");
  const [authorLabel, setAuthorLabel] = useState(item?.authorLabel ?? "");

  const canSubmit = quote.trim().length >= 10 && authorName.trim().length >= 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Éditer l'avis" : "Ajouter un avis"}
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            {item ? "Éditer l'avis" : "Ajouter un avis"}
          </h3>

          <div className="space-y-1.5">
            <label
              htmlFor="t-quote"
              className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Citation
            </label>
            <textarea
              id="t-quote"
              rows={4}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors resize-y"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="t-name"
                className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Nom affiché
              </label>
              <input
                id="t-name"
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Marie L."
                className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
                style={{ fontFamily: "var(--font-ui)" }}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="t-rating"
                className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Note
              </label>
              <select
                id="t-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n}/5)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="t-label"
              className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Label (optionnel)
            </label>
            <input
              id="t-label"
              type="text"
              value={authorLabel}
              onChange={(e) => setAuthorLabel(e.target.value)}
              placeholder="Cliente fidèle · 2024"
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="px-4 h-10 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] hover:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onSubmit({ quote, rating, authorName, authorLabel })}
              disabled={pending || !canSubmit}
              className="px-5 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pending ? "…" : item ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
