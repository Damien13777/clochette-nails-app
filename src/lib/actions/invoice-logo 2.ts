"use server";

/**
 * Server Actions — upload/suppression du logo de facture.
 * Met à jour PlatformSettings.invoiceLogoUrl. L'ancien fichier uploadé est
 * supprimé (les logos /brand/ commités ne le sont jamais).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { deleteInvoiceLogoFile, processInvoiceLogoUpload } from "@/lib/invoice-logo-files";

type Result =
  | { ok: true; url: string | null }
  | { ok: false; error: string };

export async function uploadInvoiceLogo(formData: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const processed = await processInvoiceLogoUpload(file);
  if (!processed.ok) return processed;

  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, invoiceLogoUrl: true },
  });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { invoiceLogoUrl: processed.url, updatedById: admin.id },
  });
  if (settings.invoiceLogoUrl) await deleteInvoiceLogoFile(settings.invoiceLogoUrl);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "platform.invoice_logo_uploaded",
      metadata: { url: processed.url } as object,
    },
  });
  revalidatePath("/admin/parametres");
  return { ok: true, url: processed.url };
}

export async function removeInvoiceLogo(): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, invoiceLogoUrl: true },
  });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { invoiceLogoUrl: null, updatedById: admin.id },
  });
  if (settings.invoiceLogoUrl) await deleteInvoiceLogoFile(settings.invoiceLogoUrl);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "platform.invoice_logo_removed",
      metadata: {} as object,
    },
  });
  revalidatePath("/admin/parametres");
  return { ok: true, url: null };
}
