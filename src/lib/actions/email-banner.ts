"use server";

/**
 * Server Actions — upload + suppression des bannières image des emails.
 *
 * Stocke l'image dans /public/uploads/email-banner/, met à jour
 * PlatformSettings.emailHeaderImageUrl / emailFooterImageUrl en DB.
 *
 * Slot : "header" ou "footer".
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteEmailBannerFile,
  processEmailBannerUpload,
} from "@/lib/email-banner-files";

type Slot = "header" | "footer";

type Result =
  | { ok: true; url: string }
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id };
}

export async function uploadEmailBanner(
  slot: Slot,
  formData: FormData,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };
  if (slot !== "header" && slot !== "footer")
    return { ok: false, error: "Slot invalide" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier reçu." };
  }

  const result = await processEmailBannerUpload(file);
  if (!result.ok) return result;

  // Récupère l'URL précédente pour la supprimer après mise à jour DB
  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: {
      id: true,
      emailHeaderImageUrl: true,
      emailFooterImageUrl: true,
    },
  });
  const previousUrl =
    slot === "header"
      ? settings.emailHeaderImageUrl
      : settings.emailFooterImageUrl;

  await prisma.platformSettings.update({
    where: { id: settings.id },
    data:
      slot === "header"
        ? {
            emailHeaderImageUrl: result.file.url,
            emailHeaderImageWidth: result.file.displayWidth,
          }
        : {
            emailFooterImageUrl: result.file.url,
            emailFooterImageWidth: result.file.displayWidth,
          },
  });

  // Supprime l'ancienne image (best-effort)
  if (previousUrl) {
    await deleteEmailBannerFile(previousUrl);
  }

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "platform.email_banner_uploaded",
      metadata: { slot, url: result.file.url } as object,
    },
  });

  revalidatePath("/admin/parametres");
  return { ok: true, url: result.file.url };
}

export async function removeEmailBanner(slot: Slot): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };
  if (slot !== "header" && slot !== "footer")
    return { ok: false, error: "Slot invalide" };

  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: {
      id: true,
      emailHeaderImageUrl: true,
      emailFooterImageUrl: true,
    },
  });
  const previousUrl =
    slot === "header"
      ? settings.emailHeaderImageUrl
      : settings.emailFooterImageUrl;
  if (!previousUrl) return { ok: true, url: "" };

  await prisma.platformSettings.update({
    where: { id: settings.id },
    data:
      slot === "header"
        ? { emailHeaderImageUrl: null, emailHeaderImageWidth: null }
        : { emailFooterImageUrl: null, emailFooterImageWidth: null },
  });
  await deleteEmailBannerFile(previousUrl);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "platform.email_banner_removed",
      metadata: { slot, url: previousUrl } as object,
    },
  });

  revalidatePath("/admin/parametres");
  return { ok: true, url: "" };
}
