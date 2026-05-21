"use server";

/**
 * Server Actions — CRUD ServiceOption (options supplémentaires).
 *
 * Pas de hard delete : BookingOption référence (Restrict).
 * → ARCHIVED comme soft-delete.
 *
 * Actions :
 *  - createServiceOption(formData) : crée en DRAFT
 *  - updateServiceOption(id, formData)
 *  - changeServiceOptionStatus(id, status) : DRAFT / PUBLISHED / ARCHIVED
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type ParsedFields = {
  title: string;
  slug: string;
  description: string | null;
  addedDurationMinutes: number;
  addedPriceCents: number;
  applicableCategories: ServiceCategory[];
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
  if (!slug) fieldErrors.slug = "Slug invalide (a-z, 0-9, tirets).";

  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw || null;
  if (description && description.length > 1000)
    fieldErrors.description = "Description trop longue (1000 chars max).";

  const durationStr = String(formData.get("addedDurationMinutes") ?? "");
  const addedDurationMinutes = parseInt(durationStr, 10);
  if (
    !Number.isFinite(addedDurationMinutes) ||
    addedDurationMinutes < 0 ||
    addedDurationMinutes > 300
  )
    fieldErrors.addedDurationMinutes = "Durée invalide (0-300 min).";

  const priceStr = String(formData.get("addedPriceEuros") ?? "")
    .trim()
    .replace(",", ".");
  const addedPriceEuros = parseFloat(priceStr);
  if (
    !Number.isFinite(addedPriceEuros) ||
    addedPriceEuros < 0 ||
    addedPriceEuros > 500
  )
    fieldErrors.addedPriceEuros = "Prix invalide (0-500 €).";
  const addedPriceCents = Math.round(addedPriceEuros * 100);

  // Catégories : une ou plusieurs values séparées par ","
  const categoriesRaw = String(formData.get("applicableCategories") ?? "");
  const categories = categoriesRaw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => CATEGORY_VALUES.includes(c as ServiceCategory)) as ServiceCategory[];
  if (categories.length === 0)
    fieldErrors.applicableCategories =
      "Au moins une catégorie applicable requise.";

  const orderStr = String(formData.get("displayOrder") ?? "0");
  const displayOrder = parseInt(orderStr, 10);
  if (!Number.isFinite(displayOrder) || displayOrder < 0 || displayOrder > 9999)
    fieldErrors.displayOrder = "Ordre invalide (0-9999).";

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
      description,
      addedDurationMinutes,
      addedPriceCents,
      applicableCategories: categories,
      displayOrder,
      disclaimer,
    },
  };
}

export async function createServiceOption(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok) {
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };
  }

  const existing = await prisma.serviceOption.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "Ce slug est déjà utilisé.",
      fieldErrors: { slug: "Slug déjà utilisé pour une autre option." },
    };
  }

  const created = await prisma.serviceOption.create({
    data: { ...parsed.data, status: "DRAFT" },
    select: { id: true },
  });

  revalidatePath("/admin/prestations/options");
  revalidatePath("/");
  return { ok: true, id: created.id };
}

export async function updateServiceOption(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok) {
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };
  }

  const slugConflict = await prisma.serviceOption.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
    select: { id: true },
  });
  if (slugConflict) {
    return {
      ok: false,
      error: "Ce slug est déjà utilisé.",
      fieldErrors: { slug: "Slug déjà utilisé pour une autre option." },
    };
  }

  await prisma.serviceOption.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/admin/prestations/options");
  revalidatePath(`/admin/prestations/options/${id}`);
  revalidatePath("/");
  return { ok: true, id };
}

export async function changeServiceOptionStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!STATUS_VALUES.includes(status))
    return { ok: false, error: "Status invalide." };

  await prisma.serviceOption.update({ where: { id }, data: { status } });

  revalidatePath("/admin/prestations/options");
  revalidatePath(`/admin/prestations/options/${id}`);
  revalidatePath("/");
  return { ok: true, id };
}
