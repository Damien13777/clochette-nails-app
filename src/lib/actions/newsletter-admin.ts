"use server";

/**
 * Server Actions admin newsletter.
 *
 *  unsubscribeSubscriberAdmin(id) → marque unsubscribedAt = now (idempotent)
 *  deleteSubscriberAdmin(id)      → hard delete (droit à l'effacement RGPD)
 *
 * Auth ADMIN obligatoire. Pas d'audit log RGPD ici (on supprime physiquement,
 * trace dans Notification + email si nécessaire en V2).
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id };
}

export async function unsubscribeSubscriberAdmin(
  subscriberId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true, unsubscribedAt: true },
  });
  if (!subscriber) return { ok: false, error: "Abonnée introuvable" };

  if (!subscriber.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriberId },
      data: { unsubscribedAt: new Date() },
    });
  }

  revalidatePath("/admin/newsletter");
  return { ok: true, message: "Abonnée désinscrite." };
}

export async function deleteSubscriberAdmin(
  subscriberId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await prisma.newsletterSubscriber.delete({ where: { id: subscriberId } });

  revalidatePath("/admin/newsletter");
  return { ok: true, message: "Adresse supprimée définitivement." };
}
