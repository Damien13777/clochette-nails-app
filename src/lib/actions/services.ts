"use server";

/**
 * Server Actions — CRUD prestations (admin).
 *
 * Actions :
 *  - createService(formData) : crée en DRAFT par défaut
 *  - updateService(id, formData) : update les champs
 *  - changeServiceStatus(id, status) : DRAFT / PUBLISHED / ARCHIVED
 *
 * Note : pas de hard delete. Les services ont des relations Booking
 * (onDelete: Restrict). On utilise ARCHIVED comme soft-delete.
 *
 * Slug : si non fourni, généré depuis title (slugify).
 * Unicité du slug : check en DB avant insert/update.
 */

import { revalidatePath } from "next/cache";
import type { ContentStatus, ServiceCategory } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const CATEGORY_VALUES: ServiceCategory[] = [
  "POSE_NATURELS",
  "RALLONGEMENT",
  "PACK_SPECIAL",
  "SOIN_MAINS",
  "SOIN_PIEDS",
  "DEPOSE",
];

const STATUS_VALUES: ContentStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type ParsedFields = {
  title: string;
  slug: string;
  shortDesc: string;
  description: string;
  category: ServiceCategory;
  durationMinutes: number;
  priceCents: number;
  displayOrder: number;
  disclaimer: string | null;
  metaTitle: string | null;
  metaDesc: string | null;
  tags: string[];
};

function parseFormData(
  formData: FormData,
): { ok: true; data: ParsedFields } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length < 2) fieldErrors.title = "Titre requis (2 chars min).";
  if (title.length > 120) fieldErrors.title = "Titre trop long (120 chars max).";

  let slug = String(formData.get("slug") ?? "").trim();
  if (!slug) slug = slugify(title);
  else slug = slugify(slug);
  if (!slug) fieldErrors.slug = "Slug invalide (caractères autorisés : a-z, 0-9, tirets).";

  const shortDesc = String(formData.get("shortDesc") ?? "").trim();
  if (!shortDesc || shortDesc.length < 10)
    fieldErrors.shortDesc = "Description courte requise (10 chars min).";
  if (shortDesc.length > 300)
    fieldErrors.shortDesc = "Description courte trop longue (300 chars max).";

  const description = String(formData.get("description") ?? "").trim();
  if (!description || description.length < 20)
    fieldErrors.description = "Description longue requise (20 chars min).";
  if (description.length > 5000)
    fieldErrors.description = "Description trop longue (5000 chars max).";

  const categoryRaw = String(formData.get("category") ?? "");
  if (!CATEGORY_VALUES.includes(categoryRaw as ServiceCategory))
    fieldErrors.category = "Catégorie invalide.";
  const category = categoryRaw as ServiceCategory;

  const durationStr = String(formData.get("durationMinutes") ?? "");
  const durationMinutes = parseInt(durationStr, 10);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 600)
    fieldErrors.durationMinutes = "Durée invalide (entre 5 et 600 min).";

  // Prix saisi en EUROS, converti en cents
  const priceStr = String(formData.get("priceEuros") ?? "").trim().replace(",", ".");
  const priceEuros = parseFloat(priceStr);
  if (!Number.isFinite(priceEuros) || priceEuros < 5 || priceEuros > 1000)
    fieldErrors.priceEuros = "Prix invalide (entre 5 € et 1000 €).";
  const priceCents = Math.round(priceEuros * 100);

  const orderStr = String(formData.get("displayOrder") ?? "0");
  const displayOrder = parseInt(orderStr, 10);
  if (!Number.isFinite(displayOrder) || displayOrder < 0 || displayOrder > 9999)
    fieldErrors.displayOrder = "Ordre invalide (entre 0 et 9999).";

  const disclaimerRaw = String(formData.get("disclaimer") ?? "").trim();
  const disclaimer = disclaimerRaw.length > 0 ? disclaimerRaw : null;
  if (disclaimer && disclaimer.length > 500)
    fieldErrors.disclaimer = "Avertissement trop long (500 chars max).";

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 10);

  const metaTitleRaw = String(formData.get("metaTitle") ?? "").trim();
  const metaTitle = metaTitleRaw.length > 0 ? metaTitleRaw.slice(0, 70) : null;

  const metaDescRaw = String(formData.get("metaDesc") ?? "").trim();
  const metaDesc = metaDescRaw.length > 0 ? metaDescRaw.slice(0, 160) : null;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      title,
      slug,
      shortDesc,
      description,
      category,
      durationMinutes,
      priceCents,
      displayOrder,
      disclaimer,
      metaTitle,
      metaDesc,
      tags,
    },
  };
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok) {
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };
  }

  // Check unicité slug
  const existing = await prisma.service.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "Ce slug est déjà utilisé.",
      fieldErrors: { slug: "Slug déjà utilisé pour une autre prestation." },
    };
  }

  const created = await prisma.service.create({
    data: { ...parsed.data, status: "DRAFT" },
    select: { id: true },
  });

  revalidatePath("/admin/prestations");
  revalidatePath("/");
  return { ok: true, id: created.id };
}

export async function updateService(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok) {
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };
  }

  // Check unicité slug (exclut soi-même)
  const slugConflict = await prisma.service.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
    select: { id: true },
  });
  if (slugConflict) {
    return {
      ok: false,
      error: "Ce slug est déjà utilisé.",
      fieldErrors: { slug: "Slug déjà utilisé pour une autre prestation." },
    };
  }

  await prisma.service.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/admin/prestations");
  revalidatePath(`/admin/prestations/${id}`);
  revalidatePath("/prestations");
  revalidatePath(`/prestations/${parsed.data.slug}`);
  revalidatePath("/");
  return { ok: true, id };
}

export async function changeServiceStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!STATUS_VALUES.includes(status))
    return { ok: false, error: "Status invalide." };

  await prisma.service.update({ where: { id }, data: { status } });

  revalidatePath("/admin/prestations");
  revalidatePath(`/admin/prestations/${id}`);
  revalidatePath("/");
  return { ok: true, id };
}

/**
 * Suppression définitive d'une prestation ARCHIVÉE.
 * Refusée si des réservations y sont liées (Booking onDelete: Restrict) →
 * l'historique reste intègre. Nettoie au passage les photos de couverture
 * (fichiers + records) liées à la prestation.
 */
export async function deleteService(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      _count: { select: { bookings: true } },
    },
  });
  if (!service) return { ok: false, error: "Prestation introuvable." };
  if (service.status !== "ARCHIVED") {
    return {
      ok: false,
      error: "Seules les prestations archivées peuvent être supprimées définitivement.",
    };
  }
  if (service._count.bookings > 0) {
    return {
      ok: false,
      error: `Impossible : ${service._count.bookings} réservation(s) liée(s). La prestation reste archivée pour préserver l'historique.`,
    };
  }

  // Nettoyage des photos de couverture liées (fichiers + records)
  const photos = await prisma.servicePhoto.findMany({
    where: { serviceId: id },
    select: { storageKey: true, variants: true },
  });
  const storage = getStorage();
  for (const photo of photos) {
    const keys: string[] = [];
    if (photo.storageKey) keys.push(photo.storageKey);
    if (photo.variants && typeof photo.variants === "object") {
      for (const v of Object.values(
        photo.variants as Record<string, { key?: string }>,
      )) {
        if (v?.key) keys.push(v.key);
      }
    }
    await Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));
  }
  await prisma.servicePhoto.deleteMany({ where: { serviceId: id } });

  await prisma.service.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "SERVICE_DELETED",
      metadata: { serviceId: id, title: service.title } as object,
    },
  });

  revalidatePath("/admin/prestations");
  revalidatePath("/");
  return { ok: true };
}
