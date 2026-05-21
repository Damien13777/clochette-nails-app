"use client";

/**
 * AdminShell — Client Component qui orchestre sidebar + topbar + main.
 *
 * Pattern : un seul Client Component qui gère le state d'ouverture
 * du drawer sidebar mobile, partagé entre sidebar et topbar.
 * Le contenu (children) reste libre — peut être RSC.
 */

import { useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import type { NotificationItem } from "./notifications-bell";

type Props = {
  user: { name?: string | null; email?: string | null };
  badges?: { bookings?: number; giftCards?: number; contacts?: number };
  notifications: NotificationItem[];
  unreadNotifications: number;
  children: React.ReactNode;
};

export function AdminShell({
  user,
  badges,
  notifications,
  unreadNotifications,
  children,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <AdminSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badges={badges}
      />
      <div className="lg:pl-[260px]">
        <AdminTopbar
          user={user}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          notifications={notifications}
          unreadNotifications={unreadNotifications}
        />
        <main>{children}</main>
      </div>
    </>
  );
}
