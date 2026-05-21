"use server";

/**
 * Server Actions — CRUD Ebook admin.
 *
 * Pattern aligné sur blog-admin.ts.
 *
 * Actions :
 *  - createEbook(formData)
 *  - updateEbook(id, formData)
 *  - changeEbookStatus(id, status)
 *  - uploadEbookCover(ebookId, formData)
 *  - removeEbookCover(ebookId)
 *  - uploadEbookPdf(ebookId, formData)
 *  - removeEbookPdf(ebookId) — interdit si purchases existent
 */

import { revalidatePath } from "next/cache";
import type { ContentStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteEbookCoverFile,
  deleteEbookPdfFile,
  processEbookCoverUpload,
  processEbookInlineUpload,
  processEbookPdfUpload,
} from "@/lib/ebook-files";

type ActionResult =
  | {
      ok: true;
      id?: string;
      message?: string;
      url?: string;
      pdf?: { storageKey: string; sizeBytes: number; originalName: string };
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

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
  shortDesc: string;
  description: string;
  priceCents: number;
  comparePriceCents: number | null;
  tags: string[];
  metaTitle: string | null;
  metaDesc: string | null;
  coverImageAlt: string | null;
};

function parseFormData(
  formData: FormData,
):
  | { ok: true; data: ParsedFields }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length < 3)
    fieldErrors.title = "Titre requis (3 chars min).";
  if (title.length > 200) fieldErrors.title = "Titre trop long (200 chars max).";

  let slug = String(formData.get("slug") ?? "").trim();
  if (!slug) slug = slugify(title);
  else slug = slugify(slug);
  if (!slug) fieldErrors.slug = "Slug invalide.";

  const shortDesc = String(formData.get("shortDesc") ?? "").trim();
  if (!shortDesc || shortDesc.length < 20)
    fieldErrors.shortDesc = "Pitch requis (20 chars min).";
  if (shortDesc.length > 300)
    fieldErrors.shortDesc = "Pitch trop long (300 chars max).";

  const description = String(formData.get("description") ?? "").trim();
  if (!description || description.length < 50)
    fieldErrors.description = "Description requise (50 chars min).";
  if (description.length > 50_000)
    fieldErrors.description = "Description trop longue (50 000 chars max).";

  // Prix en € envoyés depuis le form
  const priceEurosRaw = String(formData.get("priceEuros") ?? "").trim();
  const priceEuros = parseFloat(priceEurosRaw.replace(",", "."));
  let priceCents = 0;
  if (!Number.isFinite(priceEuros) || priceEuros < 0) {
    fieldErrors.priceEuros = "Prix invalide (chiffre positif).";
  } else if (priceEuros < 0.5) {
    fieldErrors.priceEuros = "Prix minimum : 0,50 €.";
  } else {
    priceCents = Math.round(priceEuros * 100);
  }

  const compareRaw = String(formData.get("comparePriceEuros") ?? "").trim();
  let comparePriceCents: number | null = null;
  if (compareRaw.length > 0) {
    const cmp = parseFloat(compareRaw.replace(",", "."));
    if (!Number.isFinite(cmp) || cmp < 0) {
      fieldErrors.comparePriceEuros = "Prix barré invalide.";
    } else if (cmp <= priceEuros) {
      fieldErrors.comparePriceEuros =
        "Le prix barré doit être supérieur au prix de vente.";
    } else {
      comparePriceCents = Math.round(cmp * 100);
    }
  }

  const tagsRaw = String(formData.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 10);

  const metaTitleRaw = String(formData.get("metaTitle") ?? "").trim();
  const metaTitle = metaTitleRaw.length > 0 ? metaTitleRaw.slice(0, 70) : null;

  const metaDescRaw = String(formData.get("metaDesc") ?? "").trim();
  const metaDesc = metaDescRaw.length > 0 ? metaDescRaw.slice(0, 160) : null;

  const altRaw = String(formData.get("coverImageAlt") ?? "").trim();
  const coverImageAlt = altRaw.length > 0 ? altRaw.slice(0, 200) : null;

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
      priceCents,
      comparePriceCents,
      tags,
      metaTitle,
      metaDesc,
      coverImageAlt,
    },
  };
}

export async function createEbook(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok)
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };

  const existing = await prisma.ebook.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "Ce slug est déjà utilisé.",
      fieldErrors: { slug: "Slug déjà utilisé." },
    };
  }

  const created = await prisma.ebook.create({
    data: { ...parsed.data, status: "DRAFT" },
    select: { id: true },
  });

  revalidatePath("/admin/ebooks");
  revalidatePath("/ebooks");
  return { ok: true, id: created.id };
}

export async function updateEbook(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok)
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };

  const slugConflict = await prisma.ebook.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
    select: { id: true },
  });
  if (slugConflict) {
    return {
      ok: false,
      error: "Ce slug est déjà utilisé.",
      fieldErrors: { slug: "Slug déjà utilisé." },
    };
  }

  await prisma.ebook.update({ where: { id }, data: parsed.data });

  const e = await prisma.ebook.findUnique({
    where: { id },
    select: { slug: true },
  });
  revalidatePath("/admin/ebooks");
  revalidatePath(`/admin/ebooks/${id}`);
  revalidatePath("/ebooks");
  if (e?.slug) revalidatePath(`/ebooks/${e.slug}`);
  return { ok: true, id };
}

export async function changeEbookStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!STATUS_VALUES.includes(status))
    return { ok: false, error: "Status invalide." };

  // Garde-fou : on ne peut pas publier un ebook sans PDF + sans prix
  if (status === "PUBLISHED") {
    const cur = await prisma.ebook.findUnique({
      where: { id },
      select: { pdfUrl: true, priceCents: true },
    });
    if (!cur) return { ok: false, error: "Ebook introuvable." };
    if (!cur.pdfUrl)
      return {
        ok: false,
        error: "Impossible de publier sans PDF : uploade-le d'abord.",
      };
    if (cur.priceCents <= 0)
      return { ok: false, error: "Le prix doit être supérieur à 0." };
  }

  await prisma.ebook.update({ where: { id }, data: { status } });

  const e = await prisma.ebook.findUnique({
    where: { id },
    select: { slug: true },
  });
  revalidatePath("/admin/ebooks");
  revalidatePath(`/admin/ebooks/${id}`);
  revalidatePath("/ebooks");
  if (e?.slug) revalidatePath(`/ebooks/${e.slug}`);
  return { ok: true, id };
}

// ─── Cover ──────────────────────────────────────────────────

export async function uploadEbookCover(
  ebookId: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const result = await processEbookCoverUpload(file);
  if (!result.ok) return result;

  const ebook = await prisma.ebook.findUnique({
    where: { id: ebookId },
    select: { id: true, coverImage: true, slug: true },
  });
  if (!ebook) return { ok: false, error: "Ebook introuvable." };

  await prisma.ebook.update({
    where: { id: ebookId },
    data: { coverImage: result.file.url },
  });
  if (ebook.coverImage) await deleteEbookCoverFile(ebook.coverImage);

  revalidatePath("/admin/ebooks");
  revalidatePath(`/admin/ebooks/${ebookId}`);
  revalidatePath("/ebooks");
  if (ebook.slug) revalidatePath(`/ebooks/${ebook.slug}`);
  return { ok: true, url: result.file.url };
}

export async function removeEbookCover(ebookId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const ebook = await prisma.ebook.findUnique({
    where: { id: ebookId },
    select: { coverImage: true, slug: true },
  });
  if (!ebook) return { ok: false, error: "Ebook introuvable." };
  if (!ebook.coverImage) return { ok: true };

  await prisma.ebook.update({
    where: { id: ebookId },
    data: { coverImage: null, coverImageAlt: null },
  });
  await deleteEbookCoverFile(ebook.coverImage);

  revalidatePath("/admin/ebooks");
  revalidatePath(`/admin/ebooks/${ebookId}`);
  return { ok: true };
}

// ─── PDF ────────────────────────────────────────────────────

export async function uploadEbookPdf(
  ebookId: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const result = await processEbookPdfUpload(file);
  if (!result.ok) return result;

  const ebook = await prisma.ebook.findUnique({
    where: { id: ebookId },
    select: { id: true, pdfUrl: true },
  });
  if (!ebook) {
    // Cleanup le PDF orphelin
    await deleteEbookPdfFile(result.file.storageKey).catch(() => {});
    return { ok: false, error: "Ebook introuvable." };
  }

  await prisma.ebook.update({
    where: { id: ebookId },
    data: {
      pdfUrl: result.file.storageKey,
      pdfSizeBytes: result.file.sizeBytes,
      pdfOriginalName: result.file.originalName,
    },
  });
  if (ebook.pdfUrl) await deleteEbookPdfFile(ebook.pdfUrl);

  revalidatePath("/admin/ebooks");
  revalidatePath(`/admin/ebooks/${ebookId}`);
  return {
    ok: true,
    pdf: {
      storageKey: result.file.storageKey,
      sizeBytes: result.file.sizeBytes,
      originalName: result.file.originalName,
    },
  };
}

export async function removeEbookPdf(ebookId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  // Garde-fou : on ne peut pas supprimer le PDF si des achats existent
  const purchasesCount = await prisma.ebookPurchase.count({
    where: { ebookId, paymentStatus: "PAID" },
  });
  if (purchasesCount > 0) {
    return {
      ok: false,
      error: `Impossible : ${purchasesCount} achat(s) en cours réfèrent ce PDF. Archive l'ebook à la place.`,
    };
  }

  const ebook = await prisma.ebook.findUnique({
    where: { id: ebookId },
    select: { pdfUrl: true, status: true },
  });
  if (!ebook) return { ok: false, error: "Ebook introuvable." };
  if (!ebook.pdfUrl) return { ok: true };

  // Si l'ebook était PUBLISHED, on le repasse en DRAFT (sinon il serait
  // visible sur le site sans PDF — bug majeur).
  await prisma.ebook.update({
    where: { id: ebookId },
    data: {
      pdfUrl: null,
      pdfSizeBytes: null,
      pdfOriginalName: null,
      status: ebook.status === "PUBLISHED" ? "DRAFT" : ebook.status,
    },
  });
  await deleteEbookPdfFile(ebook.pdfUrl);

  revalidatePath("/admin/ebooks");
  revalidatePath(`/admin/ebooks/${ebookId}`);
  return { ok: true };
}

// ─── Image inline TipTap (description) ──────────────────────

export async function uploadEbookInlineImage(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File))
    return { ok: false, error: "Aucun fichier reçu." };

  const result = await processEbookInlineUpload(file);
  if (!result.ok) return result;

  return { ok: true, url: result.file.url };
}
