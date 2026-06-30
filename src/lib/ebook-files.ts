/**
 * Helpers upload des assets ebooks :
 *  - PDF (le fichier à livrer)
 *  - Cover image (visuel sur la page produit)
 *
 * PDF : stockés dans /private/uploads/ebooks/{uuid}.pdf (hors public web pour
 *       éviter qu'un curieux ne tape l'URL directement). Téléchargement via
 *       endpoint signé qui vérifie le token EbookPurchase.downloadToken.
 *
 * Cover : stockés dans /public/uploads/ebook-covers/{uuid}.webp (servis
 *         directement, comme les couvertures blog/prestations).
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { applyWatermark } from "@/lib/watermark";
import { THUMB_WIDTH, THUMB_WEBP_QUALITY } from "@/lib/upload-thumb";

// ─── Cover ─────────────────────────────────────────────────

export const EBOOK_COVER_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "ebook-covers",
);
export const EBOOK_COVER_URL_PREFIX = "/uploads/ebook-covers";

const COVER_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const COVER_MAX_WIDTH = 1200;
const COVER_WEBP_QUALITY = 85;

const COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type ProcessedCoverFile = { url: string; sizeBytes: number };

export type CoverResult =
  | { ok: true; file: ProcessedCoverFile }
  | { ok: false; error: string };

export async function processEbookCoverUpload(file: File): Promise<CoverResult> {
  if (file.size > COVER_MAX_BYTES) {
    return {
      ok: false,
      error: `Image trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`,
    };
  }
  if (file.size === 0) return { ok: false, error: "Fichier vide." };

  const mime = file.type.toLowerCase();
  if (!COVER_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: `Format image non accepté (${mime || "inconnu"}). JPG, PNG, WebP ou HEIC.`,
    };
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  let thumb: Buffer;
  try {
    const resized = await sharp(input)
      .rotate()
      .resize({
        width: COVER_MAX_WIDTH,
        withoutEnlargement: true,
        fit: "inside",
      })
      .png()
      .toBuffer();
    const stamped = await applyWatermark(resized);
    output = await sharp(stamped).webp({ quality: COVER_WEBP_QUALITY }).toBuffer();
    // Vignette (listes) dérivée de la même image filigranée.
    thumb = await sharp(stamped)
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
    await mkdir(EBOOK_COVER_DIR, { recursive: true });
    await writeFile(path.join(EBOOK_COVER_DIR, filename), output);
    await writeFile(path.join(EBOOK_COVER_DIR, thumbName), thumb);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "écriture impossible";
    return { ok: false, error: `Enregistrement de l'image impossible (${reason}).` };
  }

  return {
    ok: true,
    file: {
      url: `${EBOOK_COVER_URL_PREFIX}/${filename}`,
      sizeBytes: output.byteLength,
    },
  };
}

export async function deleteEbookCoverFile(url: string): Promise<void> {
  if (!url.startsWith(`${EBOOK_COVER_URL_PREFIX}/`)) return;
  const filename = path.basename(url);
  if (!/^[0-9a-f-]{36}\.webp$/i.test(filename)) return;
  const thumbName = filename.replace(/\.webp$/i, "-thumb.webp");
  await unlink(path.join(EBOOK_COVER_DIR, filename)).catch(() => {});
  await unlink(path.join(EBOOK_COVER_DIR, thumbName)).catch(() => {});
}

// ─── Inline images (TipTap dans la description ebook) ──────

export const EBOOK_INLINE_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "ebook-inline",
);
export const EBOOK_INLINE_URL_PREFIX = "/uploads/ebook-inline";

export async function processEbookInlineUpload(
  file: File,
): Promise<CoverResult> {
  if (file.size > COVER_MAX_BYTES) {
    return {
      ok: false,
      error: `Image trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`,
    };
  }
  if (file.size === 0) return { ok: false, error: "Fichier vide." };

  const mime = file.type.toLowerCase();
  if (!COVER_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: `Format image non accepté (${mime || "inconnu"}). JPG, PNG, WebP ou HEIC.`,
    };
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: COVER_WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "format non décodable";
    return { ok: false, error: `Image illisible (${reason}).` };
  }

  await mkdir(EBOOK_INLINE_DIR, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await writeFile(path.join(EBOOK_INLINE_DIR, filename), output);

  return {
    ok: true,
    file: {
      url: `${EBOOK_INLINE_URL_PREFIX}/${filename}`,
      sizeBytes: output.byteLength,
    },
  };
}

// ─── PDF ───────────────────────────────────────────────────

/**
 * PDFs stockés HORS public/ : Next.js ne sert pas les fichiers d'ici
 * directement. La cliente y accède via l'endpoint signé /api/v1/ebooks/download/[token].
 */
export const EBOOK_PDF_DIR = path.join(
  process.cwd(),
  "private",
  "uploads",
  "ebooks",
);

const PDF_MAX_BYTES = 50 * 1024 * 1024; // 50 Mo
const PDF_MIME = "application/pdf";

export type ProcessedPdfFile = {
  /** Référence interne stockée en DB (relative à EBOOK_PDF_DIR). */
  storageKey: string;
  sizeBytes: number;
  originalName: string;
};

export type PdfResult =
  | { ok: true; file: ProcessedPdfFile }
  | { ok: false; error: string };

export async function processEbookPdfUpload(file: File): Promise<PdfResult> {
  if (file.size > PDF_MAX_BYTES) {
    return {
      ok: false,
      error: `PDF trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 50 Mo).`,
    };
  }
  if (file.size === 0) return { ok: false, error: "Fichier vide." };

  // file.type peut être vide selon le navigateur, on accepte si extension .pdf
  const mime = file.type.toLowerCase();
  const looksLikePdf = mime === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return { ok: false, error: "Le fichier doit être un PDF." };
  }

  // Vérification magic bytes "%PDF"
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || buffer.toString("ascii", 0, 4) !== "%PDF") {
    return { ok: false, error: "Le fichier ne semble pas être un PDF valide." };
  }

  await mkdir(EBOOK_PDF_DIR, { recursive: true });
  const storageKey = `${randomUUID()}.pdf`;
  await writeFile(path.join(EBOOK_PDF_DIR, storageKey), buffer);

  return {
    ok: true,
    file: {
      storageKey,
      sizeBytes: buffer.byteLength,
      originalName: file.name,
    },
  };
}

export async function deleteEbookPdfFile(storageKey: string): Promise<void> {
  // storageKey = juste le nom de fichier UUID.pdf
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(storageKey)) return;
  await unlink(path.join(EBOOK_PDF_DIR, storageKey)).catch(() => {});
}

/** Lit le PDF depuis le disque (utilisé par l'endpoint download). */
export async function readEbookPdf(
  storageKey: string,
): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(storageKey)) return null;
  try {
    return await readFile(path.join(EBOOK_PDF_DIR, storageKey));
  } catch {
    return null;
  }
}
