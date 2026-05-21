"use server";

/**
 * Server Actions — gestion des médias admin.
 *
 * Phase A : uploadSiteMedia / deleteSiteMedia (slots nommés).
 * Phase C/D : uploadServicePhoto, uploadPortfolioPhoto à venir.
 *
 * Toutes les actions :
 *  - Auth ADMIN obligatoire
 *  - Validation MIME + taille AVANT bufferisation
 *  - Pipeline Sharp : WebP + 3 tailles + strip EXIF
 *  - Storage adapter (local en dev, prod TBD)
 *  - revalidatePath sur la page admin medias + landing publique
 */

import { revalidatePath } from "next/cache";
import type { PhotoMood, Season, ServiceCategory } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import {
  processImage,
  validateUpload,
} from "@/lib/image-processor";

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id };
}

// ─── SITE MEDIA (slots nommés) ──────────────────────────────

/**
 * Upload (ou remplace) une photo dans un slot site nommé.
 * Si le slot existe déjà : supprime l'ancien fichier puis upsert.
 */
export async function uploadSiteMedia(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const slot = String(formData.get("slot") ?? "").trim();
  const alt = String(formData.get("alt") ?? "").trim();
  const file = formData.get("file");

  if (!slot || !/^[a-z0-9_]+$/.test(slot)) {
    return {
      ok: false,
      error: "Slot invalide (autorisé : minuscules, chiffres, underscore).",
    };
  }
  if (alt.length < 3) {
    return { ok: false, error: "Texte alternatif requis (3 caractères min)." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier reçu." };
  }

  try {
    validateUpload({ type: file.type, size: file.size, name: file.name });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Validation échouée" };
  }

  // Bufferisation + traitement Sharp
  let processed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    processed = await processImage(buffer);
  } catch (err) {
    return {
      ok: false,
      error: `Traitement image impossible : ${err instanceof Error ? err.message : "erreur"}`,
    };
  }

  // Stockage des 3 variantes
  const storage = getStorage();
  const stored: Record<string, { key: string; url: string }> = {};
  try {
    for (const [variantKey, variant] of Object.entries(processed.variants)) {
      stored[variantKey] = await storage.store(variant.buffer, "site", "webp");
    }
  } catch (err) {
    // Cleanup en cas d'échec partiel
    await Promise.all(
      Object.values(stored).map((s) => storage.remove(s.key).catch(() => {})),
    );
    return {
      ok: false,
      error: `Échec de l'upload : ${err instanceof Error ? err.message : "erreur"}`,
    };
  }

  // Si un slot existait déjà, on supprime ses anciens fichiers APRÈS succès du nouveau
  const existing = await prisma.siteMedia.findUnique({
    where: { slot },
    select: { storageKey: true, variants: true },
  });
  if (existing) {
    const oldKeys: string[] = [];
    if (existing.storageKey) oldKeys.push(existing.storageKey);
    if (existing.variants && typeof existing.variants === "object") {
      const v = existing.variants as Record<string, { key?: string }>;
      for (const variant of Object.values(v)) {
        if (variant?.key) oldKeys.push(variant.key);
      }
    }
    await Promise.all(oldKeys.map((k) => storage.remove(k).catch(() => {})));
  }

  // Upsert DB — large est la "principale", les autres en variants
  const large = stored.large!;
  await prisma.siteMedia.upsert({
    where: { slot },
    create: {
      slot,
      url: large.url,
      storageKey: large.key,
      variants: stored as object,
      alt,
      width: processed.variants.large.width,
      height: processed.variants.large.height,
      sizeBytes: processed.variants.large.sizeBytes,
      mimeType: "image/webp",
      updatedById: admin.id,
    },
    update: {
      url: large.url,
      storageKey: large.key,
      variants: stored as object,
      alt,
      width: processed.variants.large.width,
      height: processed.variants.large.height,
      sizeBytes: processed.variants.large.sizeBytes,
      mimeType: "image/webp",
      updatedById: admin.id,
    },
  });

  revalidatePath("/admin/photos/site");
  revalidatePath("/"); // Landing publique consomme hero_*
  return { ok: true };
}

export async function deleteSiteMedia(slot: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.siteMedia.findUnique({
    where: { slot },
    select: { storageKey: true, variants: true },
  });
  if (!existing) return { ok: false, error: "Slot introuvable." };

  const storage = getStorage();
  const keys: string[] = [];
  if (existing.storageKey) keys.push(existing.storageKey);
  if (existing.variants && typeof existing.variants === "object") {
    const v = existing.variants as Record<string, { key?: string }>;
    for (const variant of Object.values(v)) {
      if (variant?.key) keys.push(variant.key);
    }
  }
  await Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));

  await prisma.siteMedia.delete({ where: { slot } });

  revalidatePath("/admin/photos/site");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Update alt text uniquement (sans re-upload).
 */
export async function updateSiteMediaAlt(
  slot: string,
  alt: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (alt.trim().length < 3) {
    return { ok: false, error: "Texte alternatif requis (3 caractères min)." };
  }

  await prisma.siteMedia.update({
    where: { slot },
    data: { alt: alt.trim(), updatedById: admin.id },
  });

  revalidatePath("/admin/photos/site");
  revalidatePath("/");
  return { ok: true };
}

// ─── SERVICE COVER PHOTOS ───────────────────────────────────

/**
 * Upload (ou remplace) la cover d'une prestation.
 * On utilise ServicePhoto avec featured=true.
 * Si une cover existe déjà : supprime ses fichiers + record, puis crée la nouvelle.
 */
export async function uploadServiceCover(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const alt = String(formData.get("alt") ?? "").trim();
  const file = formData.get("file");

  if (!serviceId) return { ok: false, error: "serviceId manquant." };
  if (alt.length < 3) {
    return { ok: false, error: "Texte alternatif requis (3 caractères min)." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier reçu." };
  }

  // Récupère la catégorie (requise sur ServicePhoto)
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { category: true },
  });
  if (!service) return { ok: false, error: "Prestation introuvable." };

  try {
    validateUpload({ type: file.type, size: file.size, name: file.name });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Validation échouée" };
  }

  // Pipeline Sharp
  let processed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    processed = await processImage(buffer);
  } catch (err) {
    return {
      ok: false,
      error: `Traitement image impossible : ${err instanceof Error ? err.message : "erreur"}`,
    };
  }

  // Stockage des variantes
  const storage = getStorage();
  const stored: Record<string, { key: string; url: string }> = {};
  try {
    for (const [variantKey, variant] of Object.entries(processed.variants)) {
      stored[variantKey] = await storage.store(variant.buffer, "service", "webp");
    }
  } catch (err) {
    await Promise.all(
      Object.values(stored).map((s) => storage.remove(s.key).catch(() => {})),
    );
    return {
      ok: false,
      error: `Échec de l'upload : ${err instanceof Error ? err.message : "erreur"}`,
    };
  }

  // Supprime l'ancienne cover (featured) si elle existe
  const oldCovers = await prisma.servicePhoto.findMany({
    where: { serviceId, featured: true },
    select: { id: true },
  });
  for (const old of oldCovers) {
    await deleteServicePhotoFiles(old.id);
  }

  // Crée le nouveau record
  const large = stored.large!;
  await prisma.servicePhoto.create({
    data: {
      serviceId,
      category: service.category,
      url: large.url,
      storageKey: large.key,
      variants: stored as object,
      alt,
      featured: true,
      width: processed.variants.large.width,
      height: processed.variants.large.height,
      sizeBytes: processed.variants.large.sizeBytes,
    },
  });

  revalidatePath("/admin/photos/prestations");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteServiceCover(
  photoId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await deleteServicePhotoFiles(photoId);

  revalidatePath("/admin/photos/prestations");
  revalidatePath("/");
  return { ok: true };
}

export async function updateServiceCoverAlt(
  photoId: string,
  alt: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (alt.trim().length < 3) {
    return { ok: false, error: "Texte alternatif requis (3 caractères min)." };
  }

  await prisma.servicePhoto.update({
    where: { id: photoId },
    data: { alt: alt.trim() },
  });

  revalidatePath("/admin/photos/prestations");
  revalidatePath("/");
  return { ok: true };
}

// ─── PORTFOLIO PHOTOS ───────────────────────────────────────

const SERVICE_CATEGORY_VALUES: ServiceCategory[] = [
  "POSE_NATURELS",
  "RALLONGEMENT",
  "PACK_SPECIAL",
  "SOIN_MAINS",
  "SOIN_PIEDS",
  "DEPOSE",
];

const SEASON_VALUES: Season[] = [
  "PRINTEMPS",
  "ETE",
  "AUTOMNE",
  "HIVER",
  "TOUTE_ANNEE",
];

const MOOD_VALUES: PhotoMood[] = [
  "ELEGANT",
  "FESTIF",
  "NATUREL",
  "AUDACIEUX",
  "MINIMALISTE",
  "ROMANTIQUE",
  "TENDANCE",
];

const MAX_BATCH_FILES = 10;

/**
 * Multi-upload de photos portfolio (non-featured).
 * FormData :
 *  - category : ServiceCategory (s'applique à toutes les photos du batch)
 *  - files : un ou plusieurs File
 *  - alts : JSON stringifié d'un array de strings (1 alt par file, même ordre)
 */
export async function uploadPortfolioPhotos(
  formData: FormData,
): Promise<ActionResult<{ uploaded: number }>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const category = String(formData.get("category") ?? "").trim();
  if (!SERVICE_CATEGORY_VALUES.includes(category as ServiceCategory)) {
    return { ok: false, error: "Catégorie invalide." };
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  if (files.length === 0) return { ok: false, error: "Aucun fichier reçu." };
  if (files.length > MAX_BATCH_FILES) {
    return {
      ok: false,
      error: `Maximum ${MAX_BATCH_FILES} fichiers par batch (reçu ${files.length}).`,
    };
  }

  let alts: string[];
  try {
    const altsRaw = String(formData.get("alts") ?? "[]");
    alts = JSON.parse(altsRaw);
    if (!Array.isArray(alts) || alts.length !== files.length) {
      throw new Error("alts manquants ou incohérents");
    }
  } catch {
    return { ok: false, error: "Liste des textes alternatifs invalide." };
  }

  for (let i = 0; i < files.length; i++) {
    if (alts[i].trim().length < 3) {
      return {
        ok: false,
        error: `Texte alternatif manquant pour le fichier "${files[i].name}".`,
      };
    }
    try {
      validateUpload({
        type: files[i].type,
        size: files[i].size,
        name: files[i].name,
      });
    } catch (err) {
      return {
        ok: false,
        error: `${files[i].name} : ${err instanceof Error ? err.message : "validation échouée"}`,
      };
    }
  }

  // Traitement séquentiel (Sharp est CPU-bound, le parallèle saturerait)
  const storage = getStorage();
  let uploaded = 0;
  const createdIds: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const alt = alts[i].trim();

      const buffer = Buffer.from(await file.arrayBuffer());
      const processed = await processImage(buffer);

      const stored: Record<string, { key: string; url: string }> = {};
      for (const [variantKey, variant] of Object.entries(processed.variants)) {
        stored[variantKey] = await storage.store(
          variant.buffer,
          "portfolio",
          "webp",
        );
      }

      const large = stored.large!;
      const photo = await prisma.servicePhoto.create({
        data: {
          category: category as ServiceCategory,
          url: large.url,
          storageKey: large.key,
          variants: stored as object,
          alt,
          featured: false,
          width: processed.variants.large.width,
          height: processed.variants.large.height,
          sizeBytes: processed.variants.large.sizeBytes,
        },
        select: { id: true },
      });
      createdIds.push(photo.id);
      uploaded++;
    }
  } catch (err) {
    // Rollback : on supprime ce qui a été créé pour éviter les orphelins
    for (const id of createdIds) {
      await deleteServicePhotoFiles(id);
    }
    return {
      ok: false,
      error: `Échec après ${uploaded}/${files.length} photo(s) : ${err instanceof Error ? err.message : "erreur"}`,
    };
  }

  revalidatePath("/admin/photos/portfolio");
  revalidatePath("/");
  return { ok: true, data: { uploaded } };
}

type UpdatePortfolioFields = {
  alt?: string;
  caption?: string | null;
  category?: ServiceCategory;
  season?: Season | null;
  mood?: PhotoMood | null;
  occasion?: string | null;
  tags?: string[];
  displayOrder?: number;
};

export async function updatePortfolioPhoto(
  photoId: string,
  fields: UpdatePortfolioFields,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const data: UpdatePortfolioFields = {};
  if (fields.alt !== undefined) {
    if (fields.alt.trim().length < 3) {
      return {
        ok: false,
        error: "Texte alternatif requis (3 caractères min).",
      };
    }
    data.alt = fields.alt.trim();
  }
  if (fields.caption !== undefined) {
    data.caption = fields.caption?.trim() || null;
  }
  if (fields.category !== undefined) {
    if (!SERVICE_CATEGORY_VALUES.includes(fields.category)) {
      return { ok: false, error: "Catégorie invalide." };
    }
    data.category = fields.category;
  }
  if (fields.season !== undefined) {
    if (fields.season !== null && !SEASON_VALUES.includes(fields.season)) {
      return { ok: false, error: "Saison invalide." };
    }
    data.season = fields.season;
  }
  if (fields.mood !== undefined) {
    if (fields.mood !== null && !MOOD_VALUES.includes(fields.mood)) {
      return { ok: false, error: "Mood invalide." };
    }
    data.mood = fields.mood;
  }
  if (fields.occasion !== undefined) {
    data.occasion = fields.occasion?.trim() || null;
  }
  if (fields.tags !== undefined) {
    data.tags = fields.tags
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 40);
  }
  if (fields.displayOrder !== undefined) {
    data.displayOrder = fields.displayOrder;
  }

  await prisma.servicePhoto.update({
    where: { id: photoId },
    data,
  });

  revalidatePath("/admin/photos/portfolio");
  revalidatePath("/");
  return { ok: true };
}

export async function deletePortfolioPhoto(
  photoId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  await deleteServicePhotoFiles(photoId);

  revalidatePath("/admin/photos/portfolio");
  revalidatePath("/");
  return { ok: true };
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Supprime un ServicePhoto et tous ses fichiers de stockage associés.
 * Lit `variants` JSON pour récupérer les keys des 3 tailles.
 */
async function deleteServicePhotoFiles(photoId: string): Promise<void> {
  const photo = await prisma.servicePhoto.findUnique({
    where: { id: photoId },
    select: { id: true, storageKey: true, variants: true },
  });
  if (!photo) return;

  const storage = getStorage();
  const keys: string[] = [];
  if (photo.storageKey) keys.push(photo.storageKey);
  if (photo.variants && typeof photo.variants === "object") {
    const v = photo.variants as Record<string, { key?: string }>;
    for (const variant of Object.values(v)) {
      if (variant?.key) keys.push(variant.key);
    }
  }

  await Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));
  await prisma.servicePhoto.delete({ where: { id: photo.id } });
}
