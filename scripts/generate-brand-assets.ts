/**
 * Génère le set complet d'assets de marque du site (icônes + OG image) à partir
 * des assets fournis par le designer.
 *
 * 1) Icônes d'APPLICATION (PWA + Apple touch) en PLEIN CADRE : monogramme posé
 *    sur fond plein. Pourquoi régénérer plutôt que prendre les PNG du brand pack :
 *    ceux-ci sont des badges sur fond TRANSPARENT, ce qui casse l'apple-touch-icon
 *    (iOS comble en noir) et le maskable (besoin d'un fond plein + safe-zone).
 *
 * 2) FAVICON .ico (onglet navigateur) : assemblé depuis les favicons du designer
 *    optimisés petit (badge 16/32/48), via un writer ICO minimal qui embarque des
 *    entrées PNG compressées. On évite `png-to-ico` qui ajoute d'office une entrée
 *    256×256 non compressée (~270 Ko inutiles).
 *
 * 3) OG IMAGE (partages réseaux sociaux) : le lockup horizontal du designer posé,
 *    centré, sur fond crème → rendu épuré et pro. PNG statique consommé tel quel
 *    par Next (pas de génération programmatique Satori, pas de polices à charger).
 *
 * Sorties :
 *  - src/app/apple-icon.png         180       (iOS — convention Next metadata)
 *  - src/app/favicon.ico            16/32/48  (onglet navigateur)
 *  - public/icon-192.png            192       (PWA "any")
 *  - public/icon-512.png            512       (PWA "any" + splash)
 *  - public/icon-512-maskable.png   512       (PWA maskable — logo dans la safe-zone)
 *  - src/app/opengraph-image.png    1200×630  (OG par défaut du site)
 *
 * Seam produit duplicable : changer SOURCE_MONO / FAVICON_SRC / OG_LOCKUP / BG →
 * régénère tout le set pour une autre instance cliente.
 *
 * Usage : pnpm tsx scripts/generate-brand-assets.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const CWD = process.cwd();

// Monogramme violet sur fond transparent (déjà dans le repo, partagé avec le
// filigrane) — évite de dépendre du dossier design/ au build.
const SOURCE_MONO = path.join(CWD, "src/assets/brand/watermark-mono-color.png");

// Badge favicon optimisé petit, fourni par le designer (lisible dès 16px).
const FAVICON_SRC = path.join(
  CWD,
  "design/brand/standard/05-favicon-app",
);

// Lockup horizontal couleur (monogramme + wordmark) pour l'OG image.
const OG_LOCKUP = path.join(
  CWD,
  "design/brand/standard/03-lockup-horizontal/couleur/lockup-horizontal-couleur-1536.png",
);

// Fond plein = crème de marque (= background_color du manifest).
const BG = { r: 252, g: 251, b: 247, alpha: 1 };

const OG = { width: 1200, height: 630, lockupWidth: 880 };

type IconSpec = {
  out: string;
  size: number;
  /** Largeur du monogramme en fraction de la taille du canvas. */
  logoFraction: number;
};

const ICONS: IconSpec[] = [
  { out: "src/app/apple-icon.png", size: 180, logoFraction: 0.7 },
  { out: "public/icon-192.png", size: 192, logoFraction: 0.7 },
  { out: "public/icon-512.png", size: 512, logoFraction: 0.7 },
  // maskable : logo plus petit pour rester dans la safe-zone (cercle ~80 %).
  { out: "public/icon-512-maskable.png", size: 512, logoFraction: 0.56 },
];

async function buildIcon(spec: IconSpec): Promise<void> {
  const logoWidth = Math.round(spec.size * spec.logoFraction);

  const logo = await sharp(SOURCE_MONO)
    .resize({ width: logoWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const logoHeight = logoMeta.height ?? logoWidth;

  const top = Math.round((spec.size - logoHeight) / 2);
  const left = Math.round((spec.size - logoWidth) / 2);

  const outPath = path.join(CWD, spec.out);
  await mkdir(path.dirname(outPath), { recursive: true });

  await sharp({
    create: {
      width: spec.size,
      height: spec.size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, top, left }])
    .png()
    .toFile(outPath);

  console.log(
    `✓ ${spec.out.padEnd(34)} ${spec.size}×${spec.size}  (logo ${logoWidth}px)`,
  );
}

/**
 * Assemble un buffer .ico à partir d'images PNG (entrées PNG-compressées,
 * acceptées par tous les navigateurs modernes). Format ICONDIR + ICONDIRENTRY.
 */
function buildIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // réservé
  header.writeUInt16LE(1, 2); // type = icône
  header.writeUInt16LE(pngs.length, 4);

  const entries: Buffer[] = [];
  const images: Buffer[] = [];
  let offset = 6 + pngs.length * 16;

  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // largeur (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // hauteur
    e.writeUInt8(0, 2); // nb couleurs palette
    e.writeUInt8(0, 3); // réservé
    e.writeUInt16LE(1, 4); // plans
    e.writeUInt16LE(32, 6); // bits/pixel
    e.writeUInt32LE(data.length, 8); // taille des données
    e.writeUInt32LE(offset, 12); // offset des données
    entries.push(e);
    images.push(data);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

async function buildFavicon(): Promise<void> {
  const sizes = [16, 32, 48];
  const pngs: { size: number; data: Buffer }[] = [];
  for (const s of sizes) {
    const data = await sharp(path.join(FAVICON_SRC, `favicon-${s}.png`))
      .resize(s, s)
      .png({ compressionLevel: 9 })
      .toBuffer();
    pngs.push({ size: s, data });
  }
  const ico = buildIco(pngs);
  const outPath = path.join(CWD, "src/app/favicon.ico");
  await writeFile(outPath, ico);
  console.log(
    `✓ ${"src/app/favicon.ico".padEnd(34)} ${ico.length} octets (${sizes.join("/")})`,
  );
}

async function buildOgImage(): Promise<void> {
  const lockup = await sharp(OG_LOCKUP)
    .resize({ width: OG.lockupWidth })
    .png()
    .toBuffer();
  const lockupHeight = (await sharp(lockup).metadata()).height ?? 0;

  const top = Math.round((OG.height - lockupHeight) / 2);
  const left = Math.round((OG.width - OG.lockupWidth) / 2);

  const outPath = path.join(CWD, "src/app/opengraph-image.png");
  await sharp({
    create: { width: OG.width, height: OG.height, channels: 4, background: BG },
  })
    .composite([{ input: lockup, top, left }])
    .png()
    .toFile(outPath);

  console.log(
    `✓ ${"src/app/opengraph-image.png".padEnd(34)} ${OG.width}×${OG.height} (lockup ${OG.lockupWidth}px)`,
  );
}

async function main(): Promise<void> {
  console.log(`Source monogramme : ${SOURCE_MONO}\n`);
  for (const spec of ICONS) {
    await buildIcon(spec);
  }
  await buildFavicon();
  await buildOgImage();
  console.log("\nTerminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
