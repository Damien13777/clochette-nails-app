"use server";

/**
 * Server Actions — CRUD BlogPost admin.
 *
 * Pattern aligné sur services.ts / service-options.ts.
 *
 * Actions :
 *  - createBlogPost(formData)
 *  - updateBlogPost(id, formData)
 *  - changeBlogPostStatus(id, status, publishedAt?)
 *  - uploadBlogCover(postId, formData) — upload/remplace la cover
 *  - removeBlogCover(postId)
 *
 * Pas de hard delete : ARCHIVED comme soft-delete.
 */

import { revalidatePath } from "next/cache";
import type { BlogCategory, ContentStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  deleteBlogCoverFile,
  processBlogCoverUpload,
  processBlogInlineUpload,
} from "@/lib/blog-cover-files";
import { isBlogCategory } from "@/lib/blog-categories";

type ActionResult =
  | { ok: true; id?: string; message?: string; url?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const STATUS_VALUES: ContentStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Calcule le temps de lecture approximatif (mots / 220 mots/min).
 *  Strippe les balises HTML produites par TipTap pour ne compter que les
 *  mots réels lus par la cliente. */
function readingTimeMinutes(content: string): number {
  const words = content
    .replace(/<[^>]+>/g, " ") // strip HTML tags
    .replace(/&[a-z]+;/gi, " ") // strip entités HTML (&nbsp; &amp; etc.)
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

type ParsedFields = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: BlogCategory;
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

  const excerpt = String(formData.get("excerpt") ?? "").trim();
  if (!excerpt || excerpt.length < 20)
    fieldErrors.excerpt = "Extrait requis (20 chars min, sert au SEO + listing).";
  if (excerpt.length > 300)
    fieldErrors.excerpt = "Extrait trop long (300 chars max).";

  const content = String(formData.get("content") ?? "").trim();
  if (!content || content.length < 50)
    fieldErrors.content = "Contenu requis (50 chars min).";
  if (content.length > 50_000)
    fieldErrors.content = "Contenu trop long (50 000 chars max).";

  const categoryRaw = String(formData.get("category") ?? "");
  let category: BlogCategory = "CONSEILS";
  if (!categoryRaw) {
    fieldErrors.category = "Catégorie requise.";
  } else if (!isBlogCategory(categoryRaw)) {
    fieldErrors.category = "Catégorie invalide.";
  } else {
    category = categoryRaw;
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
      excerpt,
      content,
      category,
      tags,
      metaTitle,
      metaDesc,
      coverImageAlt,
    },
  };
}

export async function createBlogPost(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok)
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };

  const existing = await prisma.blogPost.findUnique({
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

  const created = await prisma.blogPost.create({
    data: {
      ...parsed.data,
      status: "DRAFT",
      readingTime: readingTimeMinutes(parsed.data.content),
    },
    select: { id: true },
  });

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return { ok: true, id: created.id };
}

export async function updateBlogPost(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = parseFormData(formData);
  if (!parsed.ok)
    return { ok: false, error: "Champs invalides.", fieldErrors: parsed.fieldErrors };

  const slugConflict = await prisma.blogPost.findFirst({
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

  await prisma.blogPost.update({
    where: { id },
    data: {
      ...parsed.data,
      readingTime: readingTimeMinutes(parsed.data.content),
    },
  });

  // Récupère le slug actuel pour revalidate la page publique
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true },
  });
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}`);
  revalidatePath("/blog");
  if (post?.slug) revalidatePath(`/blog/${post.slug}`);
  return { ok: true, id };
}

export async function changeBlogPostStatus(
  id: string,
  status: ContentStatus,
  publishedAtIso?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!STATUS_VALUES.includes(status))
    return { ok: false, error: "Status invalide." };

  const data: { status: ContentStatus; publishedAt?: Date | null } = { status };

  if (status === "PUBLISHED") {
    if (publishedAtIso) {
      const d = new Date(publishedAtIso);
      if (Number.isNaN(d.getTime()))
        return { ok: false, error: "Date publishedAt invalide." };
      data.publishedAt = d;
    } else {
      // Si pas de date fournie et pas déjà set, on met now
      const current = await prisma.blogPost.findUnique({
        where: { id },
        select: { publishedAt: true },
      });
      if (!current?.publishedAt) data.publishedAt = new Date();
    }
  }

  await prisma.blogPost.update({ where: { id }, data });

  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true },
  });
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}`);
  revalidatePath("/blog");
  if (post?.slug) revalidatePath(`/blog/${post.slug}`);
  return { ok: true, id };
}

/**
 * Suppression définitive d'un article ARCHIVÉ (+ nettoyage du fichier cover).
 */
export async function deleteBlogPost(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, status: true, coverImage: true },
  });
  if (!post) return { ok: false, error: "Article introuvable." };
  if (post.status !== "ARCHIVED") {
    return {
      ok: false,
      error: "Seuls les articles archivés peuvent être supprimés définitivement.",
    };
  }

  if (post.coverImage) await deleteBlogCoverFile(post.coverImage);
  await prisma.blogPost.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "BLOG_POST_DELETED",
      metadata: { blogPostId: id, title: post.title } as object,
    },
  });

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  if (post.slug) revalidatePath(`/blog/${post.slug}`);
  return { ok: true };
}

// ─── Cover image ────────────────────────────────────────────

export async function uploadBlogCover(
  postId: string,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const result = await processBlogCoverUpload(file);
  if (!result.ok) return result;

  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { id: true, coverImage: true, slug: true },
  });
  if (!post) return { ok: false, error: "Article introuvable." };

  await prisma.blogPost.update({
    where: { id: postId },
    data: { coverImage: result.file.url },
  });
  if (post.coverImage) await deleteBlogCoverFile(post.coverImage);

  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${postId}`);
  revalidatePath("/blog");
  if (post.slug) revalidatePath(`/blog/${post.slug}`);
  return { ok: true, url: result.file.url };
}

export async function removeBlogCover(postId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { coverImage: true, slug: true },
  });
  if (!post) return { ok: false, error: "Article introuvable." };
  if (!post.coverImage) return { ok: true };

  await prisma.blogPost.update({
    where: { id: postId },
    data: { coverImage: null, coverImageAlt: null },
  });
  await deleteBlogCoverFile(post.coverImage);

  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${postId}`);
  revalidatePath("/blog");
  if (post.slug) revalidatePath(`/blog/${post.slug}`);
  return { ok: true };
}

// ─── Image inline TipTap ────────────────────────────────────

/**
 * Upload une image insérée dans le contenu TipTap (pas la cover).
 * Retourne juste l'URL — pas de lien direct avec un post (l'URL sera
 * référencée dans le HTML du contenu).
 *
 * Cleanup des images orphelines : à prévoir avec un cron qui scanne les
 * contenus blog vs fichiers présents dans /uploads/blog-inline/.
 */
export async function uploadBlogInlineImage(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File))
    return { ok: false, error: "Aucun fichier reçu." };

  const result = await processBlogInlineUpload(file);
  if (!result.ok) return result;

  return { ok: true, url: result.file.url };
}
