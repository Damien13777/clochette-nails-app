"use client";

/**
 * Une ligne de notification dans la page liste complète.
 * Click sur la ligne : marque lue + navigue (si link). Sinon : juste marque lue.
 * Bouton "supprimer" optionnel en hover.
 */

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationType } from "@prisma/client";
import { AdminIcon } from "@/components/admin/admin-icon";
import {
  deleteNotification,
  markNotificationRead,
} from "@/lib/actions/notifications";

type Props = {
  notif: {
    id: string;
    type: NotificationType;
    title: string;
    body: string | null;
    link: string | null;
    readAt: Date | null;
    createdAt: Date;
  };
};

const TYPE_META: Record<
  NotificationType,
  { icon: Parameters<typeof AdminIcon>[0]["name"]; color: string; label: string }
> = {
  NEW_BOOKING: { icon: "calendar", color: "var(--color-violet-700)", label: "Nouvelle réservation" },
  DEPOSIT_PAID: { icon: "wallet", color: "var(--color-success)", label: "Acompte payé" },
  EBOOK_SOLD: { icon: "book", color: "var(--color-violet-700)", label: "Ebook vendu" },
  BOOKING_CANCELLED: { icon: "x", color: "var(--color-danger)", label: "Réservation annulée" },
  BOOKING_RESCHEDULED: { icon: "calendar", color: "var(--color-warning)", label: "RDV déplacé" },
  CONTACT_MESSAGE: { icon: "message", color: "var(--color-violet-700)", label: "Message contact" },
  REFUND_PROCESSED: { icon: "wallet", color: "var(--color-warning)", label: "Remboursement" },
  NEWSLETTER_SUBSCRIBE: { icon: "mail-plus", color: "var(--color-violet-700)", label: "Inscription newsletter" },
  NEWSLETTER_SENT: { icon: "mail-plus", color: "var(--color-success)", label: "Campagne envoyée" },
  GIFT_CARD_EXPIRING: { icon: "gift", color: "var(--color-warning)", label: "Carte cadeau expire" },
  GIFT_CARD_PURCHASED: { icon: "gift", color: "var(--color-success)", label: "Carte cadeau vendue" },
};

export function NotificationsListItem({ notif }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const meta = TYPE_META[notif.type];
  const isUnread = !notif.readAt;

  function handleMarkRead() {
    if (notif.readAt) return;
    startTransition(async () => {
      await markNotificationRead(notif.id);
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Supprimer définitivement cette notification ? Cette action est irréversible.",
      )
    )
      return;
    startTransition(async () => {
      await deleteNotification(notif.id);
      router.refresh();
    });
  }

  const inner = (
    <div
      className={`group flex items-start gap-4 px-5 py-4 transition-colors ${
        isUnread
          ? "bg-[var(--color-violet-50)]/40 hover:bg-[var(--color-violet-50)]"
          : "hover:bg-[var(--color-bone)]"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <span
        className="shrink-0 w-10 h-10 rounded-full grid place-items-center"
        style={{
          backgroundColor: `${meta.color}1a`,
          color: meta.color,
        }}
      >
        <AdminIcon name={meta.icon} size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className="text-sm"
            style={{ fontFamily: "var(--font-ui)", fontWeight: isUnread ? 500 : 400 }}
          >
            {notif.title}
          </p>
          <span
            className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-500)] shrink-0"
            style={{ fontFamily: "var(--font-display)" }}
          >
            · {meta.label}
          </span>
          {isUnread && (
            <span
              aria-label="Non lue"
              className="w-2 h-2 rounded-full bg-[var(--color-violet-600)]"
            />
          )}
        </div>
        {notif.body && (
          <p
            className="text-sm text-[var(--color-ink-500)] mt-1 leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {notif.body}
          </p>
        )}
        <p
          className="text-[10px] text-[var(--color-ink-500)] mt-2 uppercase tracking-[0.1em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {formatDateTime(notif.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isUnread && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMarkRead();
            }}
            disabled={isPending}
            aria-label="Marquer comme lue"
            title="Marquer comme lue"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--color-paper)] text-[var(--color-ink-500)] hover:text-[var(--color-success)] transition-colors disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDelete();
          }}
          disabled={isPending}
          aria-label="Supprimer cette notification"
          title="Supprimer"
          className="w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--color-paper)] text-[var(--color-ink-500)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <li>
      {notif.link ? (
        <Link href={notif.link} onClick={handleMarkRead} className="block">
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleMarkRead}
          className="w-full text-left"
        >
          {inner}
        </button>
      )}
    </li>
  );
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}
