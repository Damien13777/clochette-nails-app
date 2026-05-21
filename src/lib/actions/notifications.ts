"use server";

/**
 * Server Actions — gestion des notifications admin.
 *
 * Toutes les actions :
 *  - Vérifient que l'utilisateur courant est ADMIN
 *  - Ne touchent qu'aux notifications de l'utilisateur courant (jamais celles d'un autre)
 *  - Appellent revalidatePath pour rafraîchir le layout admin (badge cloche)
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { ok: true; count?: number }
  | { ok: false; error: string };

async function requireAdminUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session.user.id;
}

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult> {
  const userId = await requireAdminUserId();
  if (!userId) return { ok: false, error: "Non autorisé" };

  // Le where { userId } garantit qu'on ne marque que ses propres notifs
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/admin", "layout");
  return { ok: true, count: result.count };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const userId = await requireAdminUserId();
  if (!userId) return { ok: false, error: "Non autorisé" };

  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/admin", "layout");
  return { ok: true, count: result.count };
}

export async function deleteNotification(
  notificationId: string,
): Promise<ActionResult> {
  const userId = await requireAdminUserId();
  if (!userId) return { ok: false, error: "Non autorisé" };

  await prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });

  revalidatePath("/admin", "layout");
  return { ok: true };
}
