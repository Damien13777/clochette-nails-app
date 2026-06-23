"use server";

/**
 * Server Actions — CRUD des avis clientes affichés sur la landing.
 *
 * Toutes les actions : auth ADMIN, audit, revalidate landing + page admin.
 * reorderTestimonial échange les sortOrder de l'avis et de son voisin.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const testimonialSchema = z.object({
  quote: z
    .string()
    .trim()
    .min(10, "Citation trop courte (10 caractères min)")
    .max(600, "Citation trop longue (600 caractères max)"),
  rating: z.coerce.number().int().min(1, "Note entre 1 et 5").max(5, "Note entre 1 et 5"),
  authorName: z.string().trim().min(2, "Nom requis (2 caractères min)").max(80, "Nom trop long"),
  authorLabel: z
    .string()
    .trim()
    .max(80, "Label trop long")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type TestimonialInput = {
  quote: string;
  rating: number;
  authorName: string;
  authorLabel: string;
};

function revalidateAvis() {
  revalidatePath("/");
  revalidatePath("/admin/parametres/avis");
}

async function audit(adminId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { adminId, action, metadata: metadata as object },
  });
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createTestimonial(input: TestimonialInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Champs invalides.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const max = await prisma.testimonial.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.testimonial.create({
    data: { ...parsed.data, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  await audit(admin.id, "testimonial.created", {
    testimonialId: created.id,
    authorName: parsed.data.authorName,
  });
  revalidateAvis();
  return { ok: true, message: "Avis ajouté." };
}

export async function updateTestimonial(id: string, input: TestimonialInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Champs invalides.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await prisma.testimonial.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Avis introuvable." };

  await prisma.testimonial.update({ where: { id }, data: parsed.data });
  await audit(admin.id, "testimonial.updated", { testimonialId: id });
  revalidateAvis();
  return { ok: true, message: "Avis mis à jour." };
}

export async function deleteTestimonial(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.testimonial.findUnique({
    where: { id },
    select: { authorName: true },
  });
  if (!existing) return { ok: false, error: "Avis introuvable." };

  await prisma.testimonial.delete({ where: { id } });
  await audit(admin.id, "testimonial.deleted", { testimonialId: id, authorName: existing.authorName });
  revalidateAvis();
  return { ok: true, message: "Avis supprimé." };
}

export async function toggleTestimonialPublished(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.testimonial.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!existing) return { ok: false, error: "Avis introuvable." };

  await prisma.testimonial.update({ where: { id }, data: { published: !existing.published } });
  await audit(admin.id, "testimonial.toggled", { testimonialId: id, published: !existing.published });
  revalidateAvis();
  return { ok: true, message: existing.published ? "Avis dépublié." : "Avis publié." };
}

export async function reorderTestimonial(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const current = await prisma.testimonial.findUnique({
    where: { id },
    select: { id: true, sortOrder: true },
  });
  if (!current) return { ok: false, error: "Avis introuvable." };

  const neighbor = await prisma.testimonial.findFirst({
    where:
      direction === "up"
        ? { sortOrder: { lt: current.sortOrder } }
        : { sortOrder: { gt: current.sortOrder } },
    orderBy: direction === "up" ? { sortOrder: "desc" } : { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbor) return { ok: true };

  await prisma.$transaction([
    prisma.testimonial.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.testimonial.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
  ]);
  revalidateAvis();
  return { ok: true };
}

export async function updateTestimonialsGoogleLine(value: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const trimmed = value.trim();
  if (trimmed.length > 120) return { ok: false, error: "Texte trop long (120 caractères max)." };

  const settings = await prisma.platformSettings.findFirstOrThrow({ select: { id: true } });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { testimonialsGoogleLine: trimmed === "" ? null : trimmed, updatedById: admin.id },
  });
  await audit(admin.id, "testimonial.google_line_updated", { value: trimmed || null });
  revalidateAvis();
  return { ok: true, message: "Ligne Google mise à jour." };
}

export async function updateGoogleReviewUrl(value: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const trimmed = value.trim();
  if (trimmed && !/^https:\/\//i.test(trimmed)) {
    return {
      ok: false,
      error: "Le lien d'avis doit commencer par https://",
      fieldErrors: { googleReviewUrl: "URL https requise." },
    };
  }

  const settings = await prisma.platformSettings.findFirstOrThrow({ select: { id: true } });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { googleReviewUrl: trimmed === "" ? null : trimmed, updatedById: admin.id },
  });
  await audit(admin.id, "testimonial.google_review_url_updated", { value: trimmed || null });
  revalidateAvis();
  return { ok: true, message: "Lien d'avis Google mis à jour." };
}
