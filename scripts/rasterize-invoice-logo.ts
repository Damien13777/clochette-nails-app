/**
 * One-shot : rasterise le lockup SVG CN manucure en PNG pour le template
 * de facture (@react-pdf/renderer ne lit ni SVG ni WebP).
 * Usage : pnpm exec tsx scripts/rasterize-invoice-logo.ts
 */

import path from "node:path";
import sharp from "sharp";

const src = path.join(process.cwd(), "public/brand/lockup-horizontal-couleur.svg");
const dest = path.join(process.cwd(), "public/brand/lockup-horizontal-couleur.png");

sharp(src, { density: 300 })
  .resize({ width: 1200, withoutEnlargement: false })
  .png()
  .toFile(dest)
  .then((info) => console.log(`OK → ${dest} (${info.width}×${info.height})`));
