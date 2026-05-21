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
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id };
}

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
