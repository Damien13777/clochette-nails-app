"use client";

/**
 * AdminTopbar — Client Component.
 *
 * Contient :
 *  - Burger mobile (toggle sidebar)
 *  - Recherche globale (UI seulement Phase 1, command palette en P1.5)
 *  - Bouton "Nouveau" (placeholder visuel, dropdown vide pour V1)
 *  - Cloche notifications (dropdown live, branchée sur la table Notification)
 *  - UserMenu (dropdown avatar + logout fonctionnel)
 */

import { AdminIcon } from "./admin-icon";
import { UserMenu } from "./user-menu";
import { NotificationsBell, type NotificationItem } from "./notifications-bell";

type Props = {
  user: { name?: string | null; email?: string | null };
  onToggleSidebar: () => void;
  notifications: NotificationItem[];
  unreadNotifications: number;
};

export function AdminTopbar({
  user,
  onToggleSidebar,
  notifications,
  unreadNotifications,
}: Props) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-[var(--color-cream)] border-b border-[var(--color-line)] backdrop-blur-md">
      <div className="h-full px-4 lg:px-6 flex items-center gap-3">
        {/* Burger mobile */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Ouvrir le menu"
          className="lg:hidden w-10 h-10 grid place-items-center text-[var(--color-ink-900)] hover:bg-[var(--color-violet-50)] rounded-full transition-colors"
        >
          <AdminIcon name="menu" size={20} />
        </button>

        {/* Search (placeholder UI) */}
        <div className="flex-1 max-w-md relative hidden sm:block" role="search">
          <label htmlFor="admin-search" className="sr-only">
            Rechercher
          </label>
          <AdminIcon
            name="search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-500)] pointer-events-none"
          />
          <input
            id="admin-search"
            type="search"
            placeholder="Rechercher…"
            className="w-full h-10 pl-10 pr-14 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full text-sm text-[var(--color-ink-900)] focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          />
          <kbd
            className="hidden md:inline-flex items-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 h-5 rounded text-[10px] bg-[var(--color-bone)] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            ⌘K
          </kbd>
        </div>

        {/* Pousse les éléments suivants à droite */}
        <div className="flex-1 sm:flex-none" />

        {/* Bouton "Nouveau" — placeholder */}
        <button
          type="button"
          disabled
          title="Bientôt disponible"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <AdminIcon name="plus" size={14} />
          Nouveau
        </button>

        {/* Cloche notifications — live */}
        <NotificationsBell
          notifications={notifications}
          unreadCount={unreadNotifications}
        />

        {/* User menu */}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
