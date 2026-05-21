"use client";

/**
 * NewsletterForm — wired sur subscribeNewsletter (DOI CNIL).
 * Source par défaut "footer" (la prop permet de varier si réutilisé ailleurs).
 *
 * Anti-énumération : ok côté backend, donc tous les cas (jamais inscrite,
 * inscrite non confirmée, déjà confirmée) retournent ok côté UI.
 */

import { useState, useTransition } from "react";
import { subscribeNewsletter } from "@/lib/actions/newsletter";

type ViewState =
  | { kind: "idle" }
  | { kind: "success"; alreadyConfirmed: boolean }
  | { kind: "error"; message: string };

export function NewsletterForm({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  // Honeypot anti-bot : champ caché que seuls les bots remplissent.
  const [website, setWebsite] = useState("");
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await subscribeNewsletter(email, source, website);
      if (res.ok) {
        setView({ kind: "success", alreadyConfirmed: !!res.alreadyConfirmed });
        setEmail("");
        setWebsite("");
      } else {
        setView({ kind: "error", message: res.error });
      }
    });
  }

  if (view.kind === "success") {
    return (
      <div
        role="status"
        className="space-y-2"
      >
        <p
          className="text-sm text-[var(--color-violet-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {view.alreadyConfirmed
            ? "Cette adresse est déjà inscrite ✓"
            : "Merci ! Vérifiez votre boîte mail pour confirmer ✉️"}
        </p>
        {!view.alreadyConfirmed && (
          <p
            className="text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Pensez aussi à vérifier les indésirables.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="flex gap-2">
        {/* Honeypot anti-bot : invisible aux humains, rempli par les bots */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute opacity-0 pointer-events-none -z-10"
          style={{ left: "-9999px" }}
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (view.kind === "error") setView({ kind: "idle" });
          }}
          disabled={pending}
          placeholder="vous@exemple.fr"
          className="input flex-1 min-w-0 px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all disabled:opacity-60"
          aria-label="Adresse email pour la newsletter"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pending ? "…" : "OK"}
        </button>
      </form>
      {view.kind === "error" && (
        <p
          role="alert"
          className="text-xs text-[var(--color-danger)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {view.message}
        </p>
      )}
    </div>
  );
}
