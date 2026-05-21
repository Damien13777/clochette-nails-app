"use client";

/**
 * Panneau d'actions admin pour un message ContactMessage.
 *
 * Auto-mark READ au mount (1× via useEffect) si status === NEW.
 * Bouton Répondre = mailto: avec sujet pré-rempli "Re: {subject}".
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContactMessageStatus } from "@prisma/client";
import {
  archiveContact,
  deleteContact,
  markContactRead,
  markContactReplied,
  markContactUnread,
  unarchiveContact,
} from "@/lib/actions/contact-admin";

type Props = {
  id: string;
  status: ContactMessageStatus;
  email: string;
  subject: string | null;
  name: string;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

export function ContactActions({ id, status, email, subject, name }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showDelete, setShowDelete] = useState(false);
  const router = useRouter();

  // Auto-mark READ une fois au mount si NEW
  useEffect(() => {
    if (status === "NEW") {
      void markContactRead(id).then(() => router.refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runAction(
    fn: () => Promise<
      { ok: true; message?: string } | { ok: false; error: string }
    >,
    onSuccess?: () => void,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setFeedback({
          kind: "success",
          text: result.message ?? "Action effectuée.",
        });
        if (onSuccess) onSuccess();
        else router.refresh();
      } else {
        setFeedback({ kind: "error", text: result.error });
      }
    });
  }

  const mailtoSubject = subject ? `Re: ${subject}` : `Re: Votre message`;
  const mailtoBody = `Bonjour ${name},\n\n`;
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(mailtoSubject)}&body=${encodeURIComponent(mailtoBody)}`;

  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
      <h2
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Actions
      </h2>

      {feedback && (
        <div
          role="alert"
          className={`text-xs p-3 rounded-[var(--radius-sm)] ${
            feedback.kind === "success"
              ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30"
              : "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          }`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {feedback.text}
        </div>
      )}

      <a
        href={mailtoHref}
        className="w-full text-left px-4 py-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] border border-[var(--color-violet-600)] inline-block transition-colors"
      >
        <span
          className="block text-xs uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Répondre par email
        </span>
        <span
          className="block text-[11px] opacity-80 mt-0.5"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Ouvre ton client mail · pense à marquer répondu après envoi
        </span>
      </a>

      {status !== "REPLIED" && (
        <ActionButton
          label="Marquer comme répondu"
          variant="secondary"
          disabled={isPending}
          onClick={() => runAction(() => markContactReplied(id))}
        />
      )}

      {status !== "NEW" && status !== "ARCHIVED" && (
        <ActionButton
          label="Marquer non lu"
          description="Repasser dans l'inbox prioritaire"
          variant="ghost"
          disabled={isPending}
          onClick={() => runAction(() => markContactUnread(id))}
        />
      )}

      {status === "ARCHIVED" ? (
        <ActionButton
          label="Désarchiver"
          variant="ghost"
          disabled={isPending}
          onClick={() => runAction(() => unarchiveContact(id))}
        />
      ) : (
        <ActionButton
          label="Archiver"
          description="Sortir de l'inbox"
          variant="ghost"
          disabled={isPending}
          onClick={() => runAction(() => archiveContact(id))}
        />
      )}

      <ActionButton
        label="Supprimer définitivement"
        description="Action irréversible · RGPD"
        variant="ghost-danger"
        disabled={isPending}
        onClick={() => setShowDelete(true)}
      />

      {showDelete && (
        <ConfirmDialog
          title="Supprimer ce message ?"
          warning="Cette action est définitive. Le message et toutes ses métadonnées seront effacés."
          ctaLabel="Confirmer la suppression"
          onCancel={() => setShowDelete(false)}
          onConfirm={() => {
            setShowDelete(false);
            runAction(
              () => deleteContact(id),
              () => router.replace("/admin/contacts"),
            );
          }}
          disabled={isPending}
        />
      )}
    </div>
  );
}

function ActionButton({
  label,
  description,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  description?: string;
  variant: "primary" | "secondary" | "ghost" | "ghost-danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  const classes: Record<typeof variant, string> = {
    primary:
      "bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] border border-[var(--color-violet-600)]",
    secondary:
      "bg-[var(--color-violet-50)] text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)]/70 border border-[var(--color-violet-600)]/30",
    ghost:
      "bg-transparent text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] border border-[var(--color-line)]",
    "ghost-danger":
      "bg-transparent text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 rounded-[var(--radius-sm)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${classes[variant]}`}
    >
      <span
        className="block text-xs uppercase tracking-[0.06em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </span>
      {description && (
        <span
          className="block text-[11px] opacity-80 mt-0.5"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {description}
        </span>
      )}
    </button>
  );
}

function ConfirmDialog({
  title,
  warning,
  ctaLabel,
  onCancel,
  onConfirm,
  disabled,
}: {
  title: string;
  warning: string;
  ctaLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          {title}
        </h3>
        <p
          className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          ⚠ {warning}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-[var(--color-danger)] text-white hover:opacity-90"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
