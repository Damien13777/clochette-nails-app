/**
 * Helper upload des cover images d'articles blog.
 *
 * Stocké dans /public/uploads/blog/{uuid}.webp
 * Sharp resize max 1600px largeur (cover article typique), WebP qualité 85.
 * Admin auth requise côté server action (cf. lib/actions/blog-cover.ts).
 */

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { applyWatermark } from "@/lib/watermark";
import { THUMB_WIDTH, THUMB_WEBP_QUALITY } from "@/lib/upload-thumb";

export const BLOG_COVER_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "blog",
);
export const BLOG_COVER_URL_PREFIX = "/uploads/blog";

export const BLOG_INLINE_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "blog-inline",
);
export const BLOG_INLINE_URL_PREFIX = "/uploads/blog-inline";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_OUTPUT_WIDTH = 1600;
export const WEBP_QUALITY = 85;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type ProcessedCoverFile = {
  url: string;
  sizeBytes: number;
};

export type ProcessResult =
  | { ok: true; file: ProcessedCoverFile }
  | { ok: false; error: string };

export async function processBlogCoverUpload(
  file: File,
): Promise<ProcessResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`,
    };
  }
  if (file.size === 0) return { ok: false, error: "Fichier vide." };

  const mime = file.type.toLowerCase();
  if (!ACCEPTED_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: `Format non accepté (${mime || "inconnu"}). JPG, PNG, WebP ou HEIC.`,
    };
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let outputBuffer: Buffer;
  let thumbBuffer: Buffer;
  try {
    const resized = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: MAX_OUTPUT_WIDTH,
        withoutEnlargement: true,
        fit: "inside",
      })
      .png()
      .toBuffer();
    const stamped = await applyWatermark(resized);
    outputBuffer = await sharp(stamped).webp({ quality: WEBP_QUALITY }).toBuffer();
    // Vignette (listes) dérivée de la même image filigranée.
    thumbBuffer = await sharp(stamped)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "format non décodable";
    return { ok: false, error: `Image illisible (${reason}).` };
  }

  const id = randomUUID();
  const filename = `${id}.webp`;
  const thumbName = `${id}-thumb.webp`;
  try {
    await mkdir(BLOG_COVER_DIR, { recursive: true });
    await writeFile(path.join(BLOG_COVER_DIR, filename), outputBuffer);
    await writeFile(path.join(BLOG_COVER_DIR, thumbName), thumbBuffer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "écriture impossible";
    return { ok: false, error: `Enregistrement de l'image impossible (${reason}).` };
  }

  return {
    ok: true,
    file: {
      url: `${BLOG_COVER_URL_PREFIX}/${filename}`,
      sizeBytes: outputBuffer.byteLength,
    },
  };
}

export async function deleteBlogCoverFile(relativeUrl: string): Promise<void> {
  if (!relativeUrl.startsWith(`${BLOG_COVER_URL_PREFIX}/`)) return;
  const filename = path.basename(relativeUrl);
  if (!/^[0-9a-f-]{36}\.webp$/i.test(filename)) return;
  const thumbName = filename.replace(/\.webp$/i, "-thumb.webp");
  await unlink(path.join(BLOG_COVER_DIR, filename)).catch(() => {});
  await unlink(path.join(BLOG_COVER_DIR, thumbName)).catch(() => {});
}

/**
 * Variante upload pour les images inline dans le contenu TipTap.
 * Largeur max plus petite que la cover (1200px) car affichées dans le flow.
 */
export async function processBlogInlineUpload(
  file: File,
): Promise<ProcessResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`,
    };
  }
  if (file.size === 0) return { ok: false, error: "Fichier vide." };

  const mime = file.type.toLowerCase();
  if (!ACCEPTED_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: `Format non accepté (${mime || "inconnu"}). JPG, PNG, WebP ou HEIC.`,
    };
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let outputBuffer: Buffer;
  try {
    outputBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: 1200,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "format non décodable";
    return { ok: false, error: `Image illisible (${reason}).` };
  }

  await mkdir(BLOG_INLINE_DIR, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await writeFile(path.join(BLOG_INLINE_DIR, filename), outputBuffer);

  return {
    ok: true,
    file: {
      url: `${BLOG_INLINE_URL_PREFIX}/${filename}`,
      sizeBytes: outputBuffer.byteLength,
    },
  };
}
