/**
 * Upload du logo de facture : converti en PNG (transparence préservée),
 * largeur max 1200 px, stocké dans /public/uploads/invoice-logo/{uuid}.png.
 * PNG obligatoire : @react-pdf/renderer ne supporte ni SVG ni WebP.
 */

import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "uploads", "invoice-logo");
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type Result =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function processInvoiceLogoUpload(file: File): Promise<Result> {
  if (!ACCEPTED.includes(file.type)) {
    return { ok: false, error: "Format accepté : PNG, JPEG, WebP ou SVG." };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: "Fichier trop lourd (8 Mo max)." };
  }

  const input = Buffer.from(await file.arrayBuffer());
  let png: Buffer;
  try {
    png = await sharp(input, { density: 300 })
      .resize({ width: 1200, withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return { ok: false, error: "Image illisible ou corrompue." };
  }

  await mkdir(DIR, { recursive: true });
  const name = `${randomUUID()}.png`;
  await writeFile(path.join(DIR, name), png);
  return { ok: true, url: `/uploads/invoice-logo/${name}` };
}

export async function deleteInvoiceLogoFile(url: string): Promise<void> {
  if (!url.startsWith("/uploads/invoice-logo/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  } catch {
    // best-effort : fichier déjà absent
  }
}
