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
import { GlobalSearch } from "./global-search";
import { GlobalSearchMobile } from "./global-search-mobile";

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

        {/* Recherche globale cross-entités — barre inline ≥ sm */}
        <GlobalSearch />

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

        {/* Bouton loupe mobile — ouvre la modale de recherche plein écran */}
        <GlobalSearchMobile />

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
