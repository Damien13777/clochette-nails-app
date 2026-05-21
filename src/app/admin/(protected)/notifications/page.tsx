/**
 * Page /admin/notifications — liste complète des notifications.
 *
 * Server Component. Filtre via ?filter=unread|all (défaut all).
 * Pagination via ?page=N (50 par page).
 * Actions (mark read, delete, mark all read) via Server Actions.
 */

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NotificationsListItem } from "./list-item";
import { MarkAllReadButton } from "./mark-all-read-button";

export const metadata: Metadata = {
  title: "Notifications · Admin",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  filter?: "all" | "unread";
  page?: string;
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const filter = params.filter === "unread" ? "unread" : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    userId: session.user.id,
    ...(filter === "unread" ? { readAt: null } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1000px] px-5 lg:px-8 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8 mb-10">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Activité du compte
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)] flex items-center flex-wrap gap-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--color-violet-100)] text-[var(--color-violet-700)] text-xs whitespace-nowrap"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </h1>
        </div>
        {unreadCount > 0 && (
          <div className="shrink-0">
            <MarkAllReadButton />
          </div>
        )}
      </header>

      {/* Filtres */}
      <div
        role="tablist"
        aria-label="Filtrer les notifications"
        className="flex gap-2 mb-6"
      >
        <FilterChip label="Toutes" active={filter === "all"} href="/admin/notifications" />
        <FilterChip
          label={`Non lues${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          active={filter === "unread"}
          href="/admin/notifications?filter=unread"
        />
      </div>

      {/* Liste */}
      {notifications.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {filter === "unread"
              ? "Aucune notification non lue."
              : "Aucune notification pour le moment."}
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {notifications.map((n) => (
            <NotificationsListItem key={n.id} notif={n} />
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-2 mt-6"
        >
          {page > 1 && (
            <Link
              href={buildPageHref(filter, page - 1)}
              className="px-3 py-1.5 rounded-full border border-[var(--color-line)] text-xs hover:bg-[var(--color-bone)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ← Précédent
            </Link>
          )}
          <span
            className="text-xs text-[var(--color-ink-500)] px-3"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Page {page} sur {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildPageHref(filter, page + 1)}
              className="px-3 py-1.5 rounded-full border border-[var(--color-line)] text-xs hover:bg-[var(--color-bone)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Suivant →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center px-5 py-2 rounded-full text-xs uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </Link>
  );
}

function buildPageHref(filter: "all" | "unread", page: number): string {
  const params = new URLSearchParams();
  if (filter === "unread") params.set("filter", "unread");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/notifications?${qs}` : "/admin/notifications";
}
