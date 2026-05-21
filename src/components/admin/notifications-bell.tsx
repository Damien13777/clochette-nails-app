"use client";

/**
 * NotificationsBell — Client Component.
 *
 * Cloche dans le topbar admin avec :
 *  - Badge du nombre de notifications non lues
 *  - Dropdown sur clic montrant les 5 plus récentes
 *  - Click sur une notif → marque lue + navigue vers son link (si présent)
 *  - "Marquer tout comme lu" en footer
 *  - "Voir toutes les notifications" lien vers /admin/notifications
 *
 * Les data viennent en prop depuis le RSC layout. Après une action
 * (markRead, etc.), on appelle router.refresh() pour ré-hydrater.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationType } from "@prisma/client";
import { AdminIcon } from "./admin-icon";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

type Props = {
  notifications: NotificationItem[];
  unreadCount: number;
};

// Mapping type → icône + couleur d'accent
const TYPE_META: Record<
  NotificationType,
  { icon: Parameters<typeof AdminIcon>[0]["name"]; color: string }
> = {
  NEW_BOOKING: { icon: "calendar", color: "var(--color-violet-700)" },
  DEPOSIT_PAID: { icon: "wallet", color: "var(--color-success)" },
  EBOOK_SOLD: { icon: "book", color: "var(--color-violet-700)" },
  BOOKING_CANCELLED: { icon: "x", color: "var(--color-danger)" },
  BOOKING_RESCHEDULED: { icon: "calendar", color: "var(--color-warning)" },
  CONTACT_MESSAGE: { icon: "message", color: "var(--color-violet-700)" },
  REFUND_PROCESSED: { icon: "wallet", color: "var(--color-warning)" },
  NEWSLETTER_SUBSCRIBE: { icon: "mail-plus", color: "var(--color-violet-700)" },
  GIFT_CARD_EXPIRING: { icon: "gift", color: "var(--color-warning)" },
  GIFT_CARD_PURCHASED: { icon: "gift", color: "var(--color-success)" },
};

export function NotificationsBell({ notifications, unreadCount }: Props) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function handleNotifClick(notif: NotificationItem) {
    // Marque lue (fire & forget, transition pour ne pas bloquer le clic)
    if (!notif.readAt) {
      startTransition(async () => {
        await markNotificationRead(notif.id);
        router.refresh();
      });
    }
    setOpen(false);
    // La navigation se fait via le <Link> qui wrappe — on n'intervient pas
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative w-10 h-10 grid place-items-center text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] rounded-full transition-colors"
      >
        <AdminIcon name="bell" size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-danger)] text-white text-[10px] grid place-items-center ring-2 ring-[var(--color-cream)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications récentes"
          className="fixed inset-x-4 top-[4.5rem] sm:absolute sm:inset-x-auto sm:top-full sm:left-auto sm:right-0 sm:mt-2 sm:w-[520px] sm:max-w-[calc(100vw-2rem)] bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] overflow-hidden z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-line)]">
            <p
              className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] transition-colors"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p
                className="text-sm text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Aucune notification pour le moment.
              </p>
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto divide-y divide-[var(--color-line)]">
              {notifications.map((notif) => (
                <NotifRow
                  key={notif.id}
                  notif={notif}
                  onClick={() => handleNotifClick(notif)}
                />
              ))}
            </ul>
          )}

          {/* Footer */}
          <div className="border-t border-[var(--color-line)] px-4 py-2.5">
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Voir toutes les notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({
  notif,
  onClick,
}: {
  notif: NotificationItem;
  onClick: () => void;
}) {
  const meta = TYPE_META[notif.type];
  const isUnread = !notif.readAt;

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
        isUnread
          ? "bg-[var(--color-violet-50)]/50 hover:bg-[var(--color-violet-50)]"
          : "hover:bg-[var(--color-bone)]"
      }`}
    >
      <span
        className="shrink-0 w-9 h-9 rounded-full grid place-items-center"
        style={{
          backgroundColor: `${meta.color}1a`,
          color: meta.color,
        }}
      >
        <AdminIcon name={meta.icon} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-tight"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {notif.title}
        </p>
        {notif.body && (
          <p
            className="text-xs text-[var(--color-ink-500)] mt-0.5 line-clamp-2"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {notif.body}
          </p>
        )}
        <p
          className="text-[10px] text-[var(--color-ink-500)] mt-1 uppercase tracking-[0.1em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {formatRelativeTime(notif.createdAt)}
        </p>
      </div>
      {isUnread && (
        <span
          aria-label="Non lue"
          className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[var(--color-violet-600)]"
        />
      )}
    </div>
  );

  return (
    <li>
      {notif.link ? (
        <Link href={notif.link} onClick={onClick} className="block">
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left"
        >
          {content}
        </button>
      )}
    </li>
  );
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
