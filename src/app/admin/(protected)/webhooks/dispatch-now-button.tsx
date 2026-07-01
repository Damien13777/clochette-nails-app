"use client";

/**
 * Bouton « Dispatcher maintenant » — force le dépilage immédiat de la queue
 * OutboundEvent vers l'ERP, sans attendre le cron (2 min). Affiche le résumé.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dispatchOutboundNow } from "@/lib/actions/outbound-admin";

type Feedback = { kind: "success" | "error"; text: string } | null;

export function DispatchNowButton() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const router = useRouter();

  function run() {
    setFeedback(null);
    startTransition(async () => {
      const res = await dispatchOutboundNow();
      if (res.ok) {
        setFeedback({ kind: "success", text: res.message ?? "Dispatch effectué." });
        router.refresh();
      } else {
        setFeedback({ kind: "error", text: res.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {feedback && (
        <span
          className={`text-[11px] ${
            feedback.kind === "success"
              ? "text-[var(--color-success)]"
              : "text-[var(--color-danger)]"
          }`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {feedback.text}
        </span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isPending ? "Envoi…" : "Dispatcher maintenant"}
      </button>
    </div>
  );
}
