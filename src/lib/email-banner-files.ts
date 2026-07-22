/**
 * Helper d'upload pour les bannières email (haut/bas).
 * Pendant équivalent à booking-files.ts mais :
 *  - Stocké dans /public/uploads/email-banner/
 *  - Conserve le ratio horizontal (max 1200px largeur)
 *  - Utilisé par /api/admin/upload/email-banner (auth admin requise)
 */

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const EMAIL_BANNER_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "email-banner",
);
export const EMAIL_BANNER_URL_PREFIX = "/uploads/email-banner";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
/** Largeur max pour une bannière horizontale (rendue full-width 600px en email). */
export const BANNER_MAX_WIDTH = 1200;
/** Largeur max pour un logo (carré ou vertical, rendu centré). */
export const LOGO_MAX_WIDTH = 480;
/** Ratio largeur/hauteur en-dessous duquel on considère l'image comme logo. */
export const LOGO_RATIO_THRESHOLD = 1.5;
export const WEBP_QUALITY = 88;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type ProcessedBannerFile = {
  url: string;
  sizeBytes: number;
  /** Largeur d'affichage recommandée en email (px) selon le type détecté. */
  displayWidth: number;
};

export type ProcessResult =
  | { ok: true; file: ProcessedBannerFile }
  | { ok: false; error: string };

export async function processEmailBannerUpload(
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
      error: `Format non accepté (${mime || "inconnu"}). Utilisez JPG, PNG, WebP. Les photos iPhone HEIC ne sont pas prises en charge : convertis en JPG ou passe ton iPhone sur « Le plus compatible » (Réglages → Appareil photo → Formats).`,
    };
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // 1. Lit les dimensions source pour décider du mode (logo vs bannière)
  let isLogo = false;
  try {
    const meta = await sharp(inputBuffer).rotate().metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const ratio = h > 0 ? w / h : 0;
    isLogo = ratio < LOGO_RATIO_THRESHOLD;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "format non décodable";
    return { ok: false, error: `Image illisible (${reason}).` };
  }

  // 2. Redimensionne selon le mode
  const maxWidth = isLogo ? LOGO_MAX_WIDTH : BANNER_MAX_WIDTH;
  // Display width en email : logo = sa largeur naturelle (≤ LOGO_MAX_WIDTH/2),
  // bannière = full width 600 (capé par le container email).
  const displayWidth = isLogo ? Math.min(LOGO_MAX_WIDTH / 2, 240) : 600;

  let outputBuffer: Buffer;
  try {
    outputBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: maxWidth,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "format non décodable";
    return { ok: false, error: `Image illisible (${reason}).` };
  }

  await mkdir(EMAIL_BANNER_DIR, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await writeFile(path.join(EMAIL_BANNER_DIR, filename), outputBuffer);

  return {
    ok: true,
    file: {
      url: `${EMAIL_BANNER_URL_PREFIX}/${filename}`,
      sizeBytes: outputBuffer.byteLength,
      displayWidth,
    },
  };
}

/** Supprime un fichier de bannière (best-effort, ne fail pas si manquant). */
export async function deleteEmailBannerFile(relativeUrl: string): Promise<void> {
  if (!relativeUrl.startsWith(`${EMAIL_BANNER_URL_PREFIX}/`)) return;
  const filename = path.basename(relativeUrl);
  if (!/^[0-9a-f-]{36}\.webp$/i.test(filename)) return;
  await unlink(path.join(EMAIL_BANNER_DIR, filename)).catch(() => {
    /* déjà absent, no-op */
  });
}
