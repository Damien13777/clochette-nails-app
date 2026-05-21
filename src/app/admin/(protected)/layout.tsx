/**
 * Layout des pages ADMIN PROTÉGÉES — auth check + AdminShell.
 *
 * Toutes les pages sous src/app/admin/(protected)/* sont :
 *  - Réservées au rôle ADMIN (sinon redirect /admin/connexion)
 *  - Wrappées dans AdminShell (sidebar + topbar)
 *
 * Les pages publiques admin (login, password reset) sont sous
 * src/app/admin/(auth)/* et bypassent ce layout.
 */

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { prisma } from "@/lib/prisma";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  // Badges sidebar + notifications cloche : tout en parallèle
  const [bookingsPending, contactsUnread, recentNotifications, unreadCount] =
    await Promise.all([
      prisma.booking.count({ where: { status: "AWAITING_DEPOSIT" } }),
      prisma.contactMessage.count({ where: { status: "NEW" } }),
      prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
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
      prisma.notification.count({
        where: { userId: session.user.id, readAt: null },
      }),
    ]);

  const badges = {
    bookings: bookingsPending,
    contacts: contactsUnread,
  };

  return (
    <AdminShell
      user={{ name: session.user.name, email: session.user.email }}
      badges={badges}
      notifications={recentNotifications}
      unreadNotifications={unreadCount}
    >
      {children}
    </AdminShell>
  );
}
