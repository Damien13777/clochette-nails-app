"use server";

/**
 * Server actions admin pour la queue OutboundEvent.
 *
 * Actions :
 *  - retryOutboundEvent(id) : remet l'event en PENDING + reset attempts à 0
 *    + nextAttemptAt = now. Utile pour rejouer un FAILED ou ABANDONED.
 *  - abandonOutboundEvent(id) : passe en ABANDONED (stoppe les retries futurs).
 *
 * Le worker qui dépile la queue n'existe pas encore (cf. PHASE_2.md →
 * "Outbound API - Intégration future Management"). Ces actions permettent
 * dès maintenant à l'admin de gérer manuellement la queue depuis
 * /admin/webhooks.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function retryOutboundEvent(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Non autorisé" };
  }

  const event = await prisma.outboundEvent.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!event) return { ok: false, error: "Event introuvable." };

  if (event.status === "DELIVERED") {
    return {
      ok: false,
      error: "Cet event a déjà été livré, pas besoin de le rejouer.",
    };
  }

  await prisma.outboundEvent.update({
    where: { id },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });

  revalidatePath("/admin/webhooks");
  return { ok: true, message: "Event remis en file d'attente." };
}

export async function abandonOutboundEvent(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Non autorisé" };
  }

  const event = await prisma.outboundEvent.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!event) return { ok: false, error: "Event introuvable." };

  if (event.status === "DELIVERED") {
    return {
      ok: false,
      error: "Cet event est déjà livré, impossible de l'abandonner.",
    };
  }

  await prisma.outboundEvent.update({
    where: { id },
    data: { status: "ABANDONED" },
  });

  revalidatePath("/admin/webhooks");
  return { ok: true, message: "Event abandonné — plus de retry." };
}
