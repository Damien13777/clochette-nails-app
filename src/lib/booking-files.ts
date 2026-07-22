/**
 * Helper serveur pour le traitement des fichiers uploadés par la cliente
 * dans la flow réservation (sous le champ "Message optionnel").
 *
 * Stratégie :
 *  - Stockage local /public/uploads/booking-files/{uuid}.webp
 *  - Sharp compresse en WebP qualité 82, largeur max 1500px
 *  - HEIC/HEIF NON accepté (libvips du VPS n'a pas le décodeur HEVC) → rejet avec
 *    message clair ; `accept` sans heic → iOS transcode en JPEG à l'upload.
 *  - Fichiers nommés UUID v4 (impossibles à deviner)
 *  - Pas d'auth côté API : la cliente upload AVANT de soumettre le form,
 *    on associe ensuite les URLs à la booking créée. Les fichiers orphelins
 *    seront nettoyés par un cron (non implémenté en MVP).
 *
 * Limites enforced (côté serveur, source de vérité) :
 *  - Taille brute max : 5 Mo par fichier
 *  - Type MIME accepté : JPEG, PNG, WebP (HEIC exclu, cf. ci-dessus)
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const BOOKING_FILES_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "booking-files",
);
export const BOOKING_FILES_URL_PREFIX = "/uploads/booking-files";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
export const MAX_FILES_PER_BOOKING = 5;
export const MAX_OUTPUT_WIDTH = 1500;
export const WEBP_QUALITY = 82;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type ProcessedBookingFile = {
  url: string; // /uploads/booking-files/{uuid}.webp
  originalName: string;
  mimeType: string; // toujours image/webp après traitement
  sizeBytes: number; // taille finale après compression
};

export type ProcessResult =
  | { ok: true; file: ProcessedBookingFile }
  | { ok: false; error: string };

function sanitizeOriginalName(name: string): string {
  // Évite les caractères qui posent problème en CSV/email/path traversal.
  // On garde l'extension pour info, mais le nom stocké est l'UUID.
  return name
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\w\s.\-éèêàâîïôöûüçÉÈÊÀÂÎÏÔÖÛÜÇ()]/g, "")
    .slice(0, 200);
}

/**
 * Valide + compresse + persiste un fichier uploadé.
 *
 * Échoue si :
 *  - Type MIME non accepté
 *  - Taille brute > 5 Mo
 *  - Sharp n'arrive pas à lire le fichier (corrompu, format non supporté…)
 */
export async function processBookingFileUpload(
  file: File,
): Promise<ProcessResult> {
  // Validation taille brute
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "Fichier vide." };
  }

  // Validation MIME (côté serveur — le client peut lier)
  const mime = file.type.toLowerCase();
  if (!ACCEPTED_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: `Format non accepté (${mime || "inconnu"}). Utilisez JPG, PNG, WebP. Les photos iPhone HEIC ne sont pas prises en charge : convertis en JPG ou passe ton iPhone sur « Le plus compatible » (Réglages → Appareil photo → Formats).`,
    };
  }

  // Lecture en buffer
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Traitement sharp : auto-rotate (EXIF) + resize si > MAX_OUTPUT_WIDTH + WebP
  let outputBuffer: Buffer;
  try {
    const pipeline = sharp(inputBuffer)
      .rotate() // applique l'orientation EXIF
      .resize({
        width: MAX_OUTPUT_WIDTH,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: WEBP_QUALITY });
    outputBuffer = await pipeline.toBuffer();
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "format non décodable";
    return {
      ok: false,
      error: `Impossible de traiter cette image (${reason}). Essayez en JPG/PNG.`,
    };
  }

  // Écriture sur disque
  await mkdir(BOOKING_FILES_DIR, { recursive: true });
  const uuid = randomUUID();
  const filename = `${uuid}.webp`;
  const filepath = path.join(BOOKING_FILES_DIR, filename);
  await writeFile(filepath, outputBuffer);

  return {
    ok: true,
    file: {
      url: `${BOOKING_FILES_URL_PREFIX}/${filename}`,
      originalName: sanitizeOriginalName(file.name),
      mimeType: "image/webp",
      sizeBytes: outputBuffer.byteLength,
    },
  };
}

/**
 * Vérifie qu'une URL référence bien un fichier dans notre dossier upload.
 * Utilisé au moment de createBookingAction pour empêcher l'injection
 * d'URLs externes dans BookingFile.
 */
export function isValidBookingFileUrl(url: string): boolean {
  if (!url.startsWith(`${BOOKING_FILES_URL_PREFIX}/`)) return false;
  // Format strict : /uploads/booking-files/{uuid}.webp
  const rest = url.slice(BOOKING_FILES_URL_PREFIX.length + 1);
  return /^[0-9a-f-]{36}\.webp$/i.test(rest);
}
