/**
 * Filigrane (watermark) — appose le monogramme de marque sur les photos
 * publiques au moment de l'upload (hero, covers prestations, portfolio, blog,
 * ebooks). Le filigrane est BAKÉ dans chaque variante stockée : pas d'overlay
 * à l'affichage, donc zéro coût runtime côté front.
 *
 * Lisibilité — mode adaptatif : on mesure la luminance moyenne de la zone du
 * coin où le filigrane sera posé, et on choisit le monogramme violet (sur fond
 * clair) ou blanc (sur fond foncé). Les photos d'ongles sont souvent claires :
 * un blanc seul disparaîtrait. Une ombre portée douce détoure le signe dans
 * les deux cas.
 *
 * --- CONFIG (seam "produit duplicable") -------------------------------------
 * Tous les réglages sont dans WATERMARK_CONFIG. Pour une autre instance
 * cliente : remplacer les PNG pointés par `logoLight`/`logoDark` et ajuster les
 * valeurs. Le jour où l'on veut rendre ça éditable depuis l'admin, exposer ces
 * champs via PlatformSettings et lire la config ici — les 3 callers (pipeline
 * image-processor, blog-cover-files, ebook-files) n'ont pas à changer.
 *
 * Détails techniques :
 *  - L'opacité d'un PNG à alpha existant se réduit via une composition `dest-in`
 *    avec un calque uniforme dont l'alpha = opacité voulue (multiplie l'alpha).
 *  - L'ombre = le logo teinté noir, flouté, décalé, posé sous le logo.
 *  - La marge au coin est obtenue en étendant le calque (pixels transparents)
 *    puis en épinglant via gravity `southeast`.
 */

import path from "node:path";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

const BRAND_DIR = path.join(process.cwd(), "src/assets/brand");

export const WATERMARK_CONFIG = {
  enabled: true,
  /** Monogramme posé sur fond foncé. */
  logoLight: path.join(BRAND_DIR, "watermark-mono-white.png"),
  /** Monogramme posé sur fond clair (couleur de marque). */
  logoDark: path.join(BRAND_DIR, "watermark-mono-color.png"),
  /** true = choisit blanc/violet selon la luminance du coin. */
  adaptive: true,
  /** Largeur du filigrane en fraction de la largeur de l'image de base. */
  relativeWidth: 0.16,
  /** Opacité du monogramme (0–1). */
  opacity: 0.9,
  /** Opacité de l'ombre portée (0–1). */
  shadowOpacity: 0.7,
  /** Flou de l'ombre, en fraction de la largeur du filigrane. */
  shadowBlurRatio: 0.035,
  /** Décalage de l'ombre, en fraction de la largeur du filigrane. */
  shadowOffsetRatio: 0.016,
  /** Marge au coin, en fraction de la largeur de l'image de base. */
  marginRatio: 0.06,
  /** En deçà de cette largeur d'image, on ne filigrane pas (vignettes). */
  minBaseWidth: 320,
  /** Seuil de luminance [0–1] au-dessus duquel le coin est "clair". */
  lightnessThreshold: 0.55,
  gravity: "southeast" as const,
} as const;

const logoCache = new Map<string, Buffer>();

async function loadLogo(p: string): Promise<Buffer> {
  let buf = logoCache.get(p);
  if (!buf) {
    buf = await sharp(p).png().toBuffer();
    logoCache.set(p, buf);
  }
  return buf;
}

function uniformAlphaLayer(opacity: number): OverlayOptions {
  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  return {
    input: Buffer.from([255, 255, 255, alpha]),
    raw: { width: 1, height: 1, channels: 4 },
    tile: true,
    blend: "dest-in",
  };
}

/**
 * Luminance moyenne [0–1] du rectangle (en bas à droite) où ira le filigrane.
 * Sert au choix adaptatif de la teinte.
 */
async function cornerLuminance(
  base: Buffer,
  baseWidth: number,
  baseHeight: number,
  markWidth: number,
  markHeight: number,
  margin: number,
): Promise<number> {
  const w = Math.min(baseWidth, markWidth + margin);
  const h = Math.min(baseHeight, markHeight + margin);
  const left = Math.max(0, baseWidth - w);
  const top = Math.max(0, baseHeight - h);

  const { data, info } = await sharp(base)
    .extract({ left, top, width: w, height: h })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += channels) {
    // Luminance perçue (Rec. 601), normalisée.
    sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    count++;
  }
  return count ? sum / count : 1;
}

async function renderStamp(targetWidth: number, logoPath: string): Promise<Buffer> {
  const cfg = WATERMARK_CONFIG;
  const logo = await loadLogo(logoPath);

  const resized = await sharp(logo)
    .resize({ width: targetWidth })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { height = targetWidth } = await sharp(resized).metadata();

  const mark = await sharp(resized)
    .composite([uniformAlphaLayer(cfg.opacity)])
    .png()
    .toBuffer();

  const blurSigma = Math.max(1, targetWidth * cfg.shadowBlurRatio);
  const shadow = await sharp(resized)
    .tint({ r: 0, g: 0, b: 0 })
    .blur(blurSigma)
    .composite([uniformAlphaLayer(cfg.shadowOpacity)])
    .png()
    .toBuffer();

  const offset = Math.max(1, Math.round(targetWidth * cfg.shadowOffsetRatio));

  return sharp({
    create: {
      width: targetWidth + offset,
      height: height + offset,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, top: offset, left: offset },
      { input: mark, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Construit l'overlay filigrane prêt pour `.composite([overlay])`, dimensionné
 * proportionnellement à la largeur de l'image de base et — en mode adaptatif —
 * teinté selon la luminance du coin. Retourne `null` si le filigrane est
 * désactivé ou si l'image est trop petite (le caller compose alors sans rien).
 *
 * @param baseImage Buffer de l'image (déjà redimensionnée) qui recevra le mark.
 */
export async function buildWatermarkOverlay(
  baseImage: Buffer,
): Promise<OverlayOptions | null> {
  const cfg = WATERMARK_CONFIG;
  if (!cfg.enabled) return null;

  const meta = await sharp(baseImage).metadata();
  const baseWidth = meta.width ?? 0;
  const baseHeight = meta.height ?? 0;
  if (baseWidth < cfg.minBaseWidth) return null;

  const targetWidth = Math.max(1, Math.round(baseWidth * cfg.relativeWidth));
  const margin = Math.round(baseWidth * cfg.marginRatio);

  // Hauteur approx. du mark (ratio du logo source) pour échantillonner le coin.
  const probeLogo = await loadLogo(cfg.logoDark);
  const probeMeta = await sharp(probeLogo).metadata();
  const markHeight = Math.round(
    targetWidth * ((probeMeta.height ?? 1) / (probeMeta.width ?? 1)),
  );

  let logoPath = cfg.logoDark;
  if (cfg.adaptive) {
    const lum = await cornerLuminance(
      baseImage,
      baseWidth,
      baseHeight,
      targetWidth,
      markHeight,
      margin,
    );
    logoPath = lum >= cfg.lightnessThreshold ? cfg.logoDark : cfg.logoLight;
  }

  const stamp = await renderStamp(targetWidth, logoPath);
  const spaced = await sharp(stamp)
    .extend({
      right: margin,
      bottom: margin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return { input: spaced, gravity: cfg.gravity };
}

/**
 * Applique le filigrane sur une image déjà redimensionnée et retourne le buffer
 * composité (PNG lossless) — au caller de ré-encoder en WebP avec sa propre
 * qualité. Si le filigrane est désactivé ou l'image trop petite, retourne le
 * buffer d'entrée inchangé.
 *
 * Le filigrane est volontairement appliqué AVANT l'encodage final pour qu'il
 * soit baké dans le fichier stocké (zéro overlay runtime côté front).
 */
export async function applyWatermark(image: Buffer): Promise<Buffer> {
  const overlay = await buildWatermarkOverlay(image);
  if (!overlay) return image;
  return sharp(image).composite([overlay]).png().toBuffer();
}
