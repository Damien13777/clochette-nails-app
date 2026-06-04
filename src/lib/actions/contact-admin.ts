"use server";

/**
 * Server Actions — gestion admin de l'inbox /admin/contacts.
 *
 * Toutes les actions :
 *  - Auth ADMIN required
 *  - Audit dans AuditLog
 *  - revalidatePath admin (layout pour rafraîchir le badge du sidebar)
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function audit(
  adminId: string,
  contactId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      metadata: { contactId, ...(metadata ?? {}) } as object,
    },
  });
}

/** NEW → READ (idempotent : no-op si déjà au moins READ). */
export async function markContactRead(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const msg = await prisma.contactMessage.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!msg) return { ok: false, error: "Message introuvable" };
  if (msg.status !== "NEW") return { ok: true };

  await prisma.contactMessage.update({
    where: { id },
    data: { status: "READ" },
  });
  await audit(admin.id, id, "contact.read");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** READ → NEW (toggle pour signaler "à retraiter"). */
export async function markContactUnread(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await prisma.contactMessage.update({
    where: { id },
    data: { status: "NEW" },
  });
  await audit(admin.id, id, "contact.marked_unread");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Message remis en non lu." };
}

/** * → REPLIED. */
export async function markContactReplied(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await prisma.contactMessage.update({
    where: { id },
    data: { status: "REPLIED" },
  });
  await audit(admin.id, id, "contact.replied");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Message marqué comme répondu." };
}

/** * → ARCHIVED. */
export async function archiveContact(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await prisma.contactMessage.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await audit(admin.id, id, "contact.archived");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Message archivé." };
}

/** ARCHIVED → READ. */
export async function unarchiveContact(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await prisma.contactMessage.update({
    where: { id },
    data: { status: "READ", archivedAt: null },
  });
  await audit(admin.id, id, "contact.unarchived");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Message désarchivé." };
}

/** Suppression définitive. RGPD friendly. */
export async function deleteContact(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const msg = await prisma.contactMessage.findUnique({
    where: { id },
    select: { name: true, email: true, status: true },
  });
  if (!msg) return { ok: false, error: "Message introuvable" };

  await prisma.contactMessage.delete({ where: { id } });
  await audit(admin.id, id, "contact.deleted", {
    name: msg.name,
    email: msg.email,
    status: msg.status,
  });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Message supprimé définitivement." };
}
