/**
 * Backfill filigrane — applique rétroactivement le watermark de marque sur les
 * photos publiques DÉJÀ uploadées, au rendu strictement identique au pipeline
 * d'upload (même fonction `applyWatermark`, même ré-encodage WebP q82).
 *
 * Cibles (résolues via la DB, pas en balayant les dossiers) :
 *  - SiteMedia        : hero + slots nommés (3 variantes chacune)
 *  - ServicePhoto     : covers prestations (featured) + portfolio (3 variantes)
 *  - BlogPost         : coverImage (fichier unique)
 *  - Ebook            : coverImage (fichier unique)
 *
 * EXCLUS volontairement (le pipeline ne les filigrane pas) :
 *  blog-inline, ebook-inline, booking-files, email-banner.
 *
 * Sécurités :
 *  - DRY-RUN par défaut : aucune écriture, juste le rapport de ciblage.
 *  - Passe réelle via --apply : backup complet de public/uploads/ AVANT la 1re
 *    écriture, puis overwrite in-place (même key/url → la DB reste valide).
 *  - Manifeste JSON des fichiers déjà traités, persisté après chaque écriture →
 *    un re-run skippe ce qui est fait (anti double-tatouage).
 *  - Les variantes trop petites (< minBaseWidth) sont ignorées sans ré-encodage
 *    (zéro perte de génération) — exactement comme le pipeline.
 *
 * Usage :
 *   pnpm tsx scripts/backfill-watermark.ts            # dry-run (défaut)
 *   pnpm tsx scripts/backfill-watermark.ts --apply    # backup + overwrite réel
 */

import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { applyWatermark } from "../src/lib/watermark";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const CWD = process.cwd();
const UPLOADS_DIR = path.join(CWD, "public", "uploads");
const MANIFEST_PATH = path.join(CWD, "scripts", ".watermark-backfill-manifest.json");
const WEBP_QUALITY = 82;

type Variants = Record<string, { key?: string; url?: string }> | null;

type Target = {
  label: string;
  relKey: string; // identifiant stable pour le manifeste
  absPath: string; // chemin disque à réécrire
  sizeUpdate?: { model: "siteMedia" | "servicePhoto"; id: string };
};

function keyToAbs(key: string): string {
  return path.join(UPLOADS_DIR, key);
}

function urlToAbs(url: string): { relKey: string; absPath: string } | null {
  // url public = /uploads/<relKey>
  const m = url.match(/^\/uploads\/(.+)$/);
  if (!m) return null;
  const relKey = m[1];
  return { relKey, absPath: path.join(UPLOADS_DIR, relKey) };
}

function pushVariantTargets(
  targets: Target[],
  label: string,
  storageKey: string | null,
  variants: Variants,
  sizeUpdateModel: "siteMedia" | "servicePhoto",
  recordId: string,
): void {
  if (variants && typeof variants === "object") {
    for (const [vk, v] of Object.entries(variants)) {
      if (!v?.key) continue;
      targets.push({
        label: `${label} (${vk})`,
        relKey: v.key,
        absPath: keyToAbs(v.key),
        sizeUpdate:
          vk === "large" ? { model: sizeUpdateModel, id: recordId } : undefined,
      });
    }
    return;
  }
  // Fallback : pas de variants JSON → on prend storageKey seul
  if (storageKey) {
    targets.push({
      label: `${label} (storageKey)`,
      relKey: storageKey,
      absPath: keyToAbs(storageKey),
      sizeUpdate: { model: sizeUpdateModel, id: recordId },
    });
  }
}

async function collectTargets(prisma: PrismaClient): Promise<Target[]> {
  const targets: Target[] = [];

  const siteMedias = await prisma.siteMedia.findMany({
    select: { id: true, slot: true, storageKey: true, variants: true },
  });
  for (const sm of siteMedias) {
    pushVariantTargets(
      targets,
      `SiteMedia[${sm.slot}]`,
      sm.storageKey,
      sm.variants as Variants,
      "siteMedia",
      sm.id,
    );
  }

  const photos = await prisma.servicePhoto.findMany({
    select: { id: true, featured: true, storageKey: true, variants: true },
  });
  for (const p of photos) {
    pushVariantTargets(
      targets,
      p.featured ? "ServicePhoto cover" : "ServicePhoto portfolio",
      p.storageKey,
      p.variants as Variants,
      "servicePhoto",
      p.id,
    );
  }

  const blogs = await prisma.blogPost.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, coverImage: true },
  });
  for (const b of blogs) {
    const resolved = urlToAbs(b.coverImage!);
    if (resolved) {
      targets.push({
        label: "BlogPost cover",
        relKey: resolved.relKey,
        absPath: resolved.absPath,
      });
    }
  }

  const ebooks = await prisma.ebook.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, coverImage: true },
  });
  for (const e of ebooks) {
    const resolved = urlToAbs(e.coverImage!);
    if (resolved) {
      targets.push({
        label: "Ebook cover",
        relKey: resolved.relKey,
        absPath: resolved.absPath,
      });
    }
  }

  // Dédoublonnage par chemin disque
  const seen = new Set<string>();
  return targets.filter((t) => {
    if (seen.has(t.absPath)) return false;
    seen.add(t.absPath);
    return true;
  });
}

async function loadManifest(): Promise<Set<string>> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

async function saveManifest(done: Set<string>): Promise<void> {
  await writeFile(MANIFEST_PATH, JSON.stringify([...done], null, 2), "utf8");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function backupUploads(): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(CWD, `.backup-uploads-${ts}`);
  await mkdir(dest, { recursive: true });
  await cp(UPLOADS_DIR, dest, { recursive: true });
  return dest;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const targets = await collectTargets(prisma);
    const manifest = await loadManifest();

    // Tri pour un rapport lisible
    targets.sort((a, b) => a.label.localeCompare(b.label));

    const missing: Target[] = [];
    const alreadyDone: Target[] = [];
    const toProcess: Target[] = [];

    for (const t of targets) {
      if (manifest.has(t.relKey)) {
        alreadyDone.push(t);
        continue;
      }
      if (!(await fileExists(t.absPath))) {
        missing.push(t);
        continue;
      }
      toProcess.push(t);
    }

    console.log(`\n=== Backfill filigrane — ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
    console.log(`Cibles totales (DB)      : ${targets.length}`);
    console.log(`Déjà traitées (manifeste): ${alreadyDone.length}`);
    console.log(`Fichiers manquants disque: ${missing.length}`);
    console.log(`À traiter cette passe    : ${toProcess.length}\n`);

    if (missing.length) {
      console.log("⚠️  Manquants (DB pointe un fichier absent) :");
      for (const t of missing) console.log(`   - ${t.label} → ${t.relKey}`);
      console.log("");
    }

    console.log("Fichiers à traiter :");
    for (const t of toProcess) console.log(`   • ${t.label} → ${t.relKey}`);
    console.log("");

    if (!APPLY) {
      console.log("DRY-RUN : aucune écriture. Relancer avec --apply pour exécuter.\n");
      return;
    }

    if (toProcess.length === 0) {
      console.log("Rien à traiter. Fin.\n");
      return;
    }

    const backupPath = await backupUploads();
    console.log(`Backup créé : ${backupPath}\n`);

    let stamped = 0;
    let skippedSmall = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (const t of toProcess) {
      const input = await readFile(t.absPath);
      bytesBefore += input.byteLength;

      const marked = await applyWatermark(input);
      if (marked === input) {
        // Trop petite (< minBaseWidth) → ignorée, comme le pipeline. Pas de
        // ré-encodage → zéro perte. On la marque "faite" pour ne pas la revoir.
        skippedSmall++;
        bytesAfter += input.byteLength;
        manifest.add(t.relKey);
        await saveManifest(manifest);
        console.log(`   – ${t.label} : trop petite, ignorée`);
        continue;
      }

      const out = await sharp(marked)
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer();
      await writeFile(t.absPath, out);
      bytesAfter += out.byteLength;
      stamped++;

      if (t.sizeUpdate) {
        if (t.sizeUpdate.model === "siteMedia") {
          await prisma.siteMedia.update({
            where: { id: t.sizeUpdate.id },
            data: { sizeBytes: out.byteLength },
          });
        } else {
          await prisma.servicePhoto.update({
            where: { id: t.sizeUpdate.id },
            data: { sizeBytes: out.byteLength },
          });
        }
      }

      manifest.add(t.relKey);
      await saveManifest(manifest);
      console.log(`   ✓ ${t.label}`);
    }

    console.log("\n=== Terminé ===");
    console.log(`Filigranées : ${stamped}`);
    console.log(`Ignorées (trop petites) : ${skippedSmall}`);
    console.log(
      `Poids : ${(bytesBefore / 1024).toFixed(0)} Ko → ${(bytesAfter / 1024).toFixed(0)} Ko`,
    );
    console.log(`Backup : ${backupPath}`);
    console.log(`Manifeste : ${MANIFEST_PATH}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
