/**
 * Storage adapter — abstraction pour upload/delete de fichiers.
 *
 * Phase 1.5 : implémentation locale uniquement (écrit dans /public/uploads/).
 * En prod : remplacer par VercelBlobAdapter / R2Adapter.
 *
 * Convention :
 *  - `key` est l'identifiant interne (chemin relatif depuis la racine du store).
 *  - `url` est l'URL publique (préfixée par /uploads/ en local, ou CDN en prod).
 *
 * Format de key : `<scope>/<yyyy-mm>/<uuid>.<ext>` (regroupement par mois pour
 * limiter le nombre de fichiers par dossier).
 */

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type StorageScope = "site" | "service" | "portfolio";

export type StoreResult = {
  key: string;
  url: string;
};

export interface StorageAdapter {
  store(
    buffer: Buffer,
    scope: StorageScope,
    extension: string,
  ): Promise<StoreResult>;
  remove(key: string): Promise<void>;
}

// ─── Local impl (dev) ────────────────────────────────────────

class LocalStorageAdapter implements StorageAdapter {
  private rootDir: string;
  private publicPrefix: string;

  constructor() {
    this.rootDir = path.join(process.cwd(), "public", "uploads");
    this.publicPrefix = "/uploads";
  }

  async store(
    buffer: Buffer,
    scope: StorageScope,
    extension: string,
  ): Promise<StoreResult> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const filename = `${randomUUID()}.${extension.replace(/^\./, "")}`;
    const key = path.posix.join(scope, yearMonth, filename);

    const fullPath = path.join(this.rootDir, scope, yearMonth, filename);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    const url = `${this.publicPrefix}/${key}`;
    return { key, url };
  }

  async remove(key: string): Promise<void> {
    if (!key) return;
    // Sécurité : empêche path traversal (ex : "../../etc/passwd")
    const safeKey = path.posix.normalize(key);
    if (safeKey.startsWith("..") || path.isAbsolute(safeKey)) {
      throw new Error(`Storage key invalide : ${key}`);
    }
    const fullPath = path.join(this.rootDir, safeKey);
    try {
      await unlink(fullPath);
    } catch (err) {
      // ENOENT = déjà supprimé, on ignore
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────

let _instance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!_instance) _instance = new LocalStorageAdapter();
  return _instance;
}
