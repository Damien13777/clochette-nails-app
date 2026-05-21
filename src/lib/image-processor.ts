/**
 * Pipeline image — Sharp.
 *
 * Reçoit un Buffer brut (depuis FormData), valide que c'est bien une image,
 * strippe les EXIF (privacy + perf), génère 3 variantes WebP :
 *  - thumb   : 400px max (covers liste, vignettes admin)
 *  - medium  : 800px max (cards mobile, prévisualisations)
 *  - large   : 1600px max (covers desktop, lightbox)
 *
 * Si l'image source est plus petite qu'une variante, on garde sa taille.
 *
 * MIME whitelist : image/jpeg, image/png, image/webp, image/avif
 * Taille max : 8 MB (à valider AVANT d'appeler ce module)
 */

import sharp from "sharp";

export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

const VARIANTS = {
  thumb: 400,
  medium: 800,
  large: 1600,
} as const;

export type VariantKey = keyof typeof VARIANTS;

export type ProcessedVariant = {
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
};

export type ProcessedImage = {
  original: {
    width: number;
    height: number;
    format: string;
  };
  variants: Record<VariantKey, ProcessedVariant>;
};

/**
 * Traite une image source et retourne 3 variantes WebP redimensionnées.
 * Throw si l'input n'est pas une image valide.
 */
export async function processImage(
  input: Buffer,
): Promise<ProcessedImage> {
  // Détecte le format et les dimensions — throw si invalide
  const probe = sharp(input, { failOn: "error" });
  const metadata = await probe.metadata();

  if (!metadata.format || !metadata.width || !metadata.height) {
    throw new Error("Format d'image non reconnu ou métadonnées manquantes.");
  }

  const variants: Partial<Record<VariantKey, ProcessedVariant>> = {};

  for (const [key, maxSize] of Object.entries(VARIANTS) as [
    VariantKey,
    number,
  ][]) {
    // Skip resize si l'image est déjà plus petite (évite l'upscale)
    const targetSize =
      metadata.width >= metadata.height
        ? Math.min(maxSize, metadata.width)
        : Math.min(maxSize, metadata.height);

    const buffer = await sharp(input)
      .rotate() // Auto-orient selon EXIF AVANT de stripper
      .resize({
        width: metadata.width >= metadata.height ? targetSize : undefined,
        height: metadata.width < metadata.height ? targetSize : undefined,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: 82, effort: 4 })
      .withMetadata({ exif: undefined }) // Strip EXIF (privacy + bytes)
      .toBuffer();

    const variantMeta = await sharp(buffer).metadata();
    variants[key] = {
      buffer,
      width: variantMeta.width ?? targetSize,
      height: variantMeta.height ?? targetSize,
      sizeBytes: buffer.byteLength,
    };
  }

  return {
    original: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    },
    variants: variants as Record<VariantKey, ProcessedVariant>,
  };
}

/**
 * Helper : valide rapidement qu'un mime/size est acceptable avant
 * de buffer-iser le fichier. Throw avec un message clair sinon.
 */
export function validateUpload(file: {
  type: string;
  size: number;
  name: string;
}): void {
  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
    throw new Error(
      `Format non supporté : ${file.type}. Formats acceptés : JPEG, PNG, WebP, AVIF.`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB). Max : ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (file.size < 100) {
    throw new Error("Fichier vide ou corrompu.");
  }
}
